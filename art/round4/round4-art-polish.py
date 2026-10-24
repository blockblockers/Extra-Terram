from pathlib import Path
from PIL import Image, ImageFilter, ImageEnhance, ImageDraw
import numpy as np, hashlib, json
ROOT=Path(__file__).resolve().parents[1]
SPR=ROOT/'public'/'sprites'
TOWERS={
'rootkin':['whirlseed','spirebirch','sapwell','elderwood'],
'assembly':['tar-sprayer','railgun','salvage-rig','relay-mast'],
'chitin':['web-spinner','stalker-eye','resin-nest','pheromone-node'],
'lumenari':['chrono-field','pulsar','solar-collector','resonator'],
}
ACCENT={'rootkin':(139,213,81),'assembly':(255,190,57),'chitin':(183,92,244),'lumenari':(75,215,255)}
# Painterly material pass: preserve alpha/silhouette and add soft directional light, microtexture, warm/cool material variation.
for race,names in TOWERS.items():
  for name in names:
    for state in ('t1','t2','t3a','t3b'):
      p=SPR/race/name/f'{state}.png'
      if not p.exists(): continue
      im=Image.open(p).convert('RGBA')
      a=np.array(im).astype(np.float32)
      rgb=a[:,:,:3]; alpha=a[:,:,3]/255.0
      h,w=alpha.shape
      yy,xx=np.mgrid[0:h,0:w].astype(np.float32)
      # Light from upper left; preserve empty transparent canvas and keep silhouette unchanged.
      light=np.clip(1.12 - 0.22*(xx/w) - 0.18*(yy/h),0.68,1.15)
      # Gentle central form shading, with a tier-sensitive warm/cool accent.
      cx,cy=w*.5,h*.56
      rad=np.sqrt(((xx-cx)/(w*.55))**2+((yy-cy)/(h*.58))**2)
      form=np.clip(1.08-rad*.16,0.82,1.08)
      # Stable per-file microtexture, restrained so edges stay crisp at game size.
      seed=int(hashlib.sha1(str(p).encode()).hexdigest()[:8],16)
      rng=np.random.default_rng(seed)
      noise=rng.normal(0,3.0,(h,w,1)).astype(np.float32)
      out=rgb*light[:,:,None]*form[:,:,None]+noise
      # Small palette tint by faction; stronger in brighter areas, very subtle overall.
      accent=np.array(ACCENT[race],dtype=np.float32)
      lum=rgb.mean(axis=2,keepdims=True)/255.0
      tint=(accent[None,None,:]-rgb)*np.clip(lum-.35,0,.4)*0.10
      out=np.clip(out+tint,0,255)
      # Fine surface flecks clipped to existing nontransparent artwork only.
      flecks=(rng.random((h,w))>.996) & (alpha>.65)
      out[flecks]=np.clip(out[flecks]*1.12+10,0,255)
      # Restore alpha exactly, maintain transparent canvas and silhouette.
      a[:,:,:3]=out
      a[:,:,3]=np.array(Image.open(p).convert('RGBA'))[:,:,3]
      Image.fromarray(np.uint8(np.clip(a,0,255)),'RGBA').save(p,optimize=True)

# Build a clean title illustration by extracting the text-free cinematic scene from the generated art board.
# The live brand lockup is already separate in Menu.tsx, so no baked lettering is needed.
board=Path('/mnt/data/a_wide_high_resolution_concept_asset_showcase_col.png')
if board.exists():
  src=Image.open(board).convert('RGB')
  scene=src.crop((8,4,500,480))
  # Upscale scene into the upper 72% of the portrait key-art canvas.
  scene=scene.resize((1536,1485),Image.Resampling.LANCZOS)
  scene=ImageEnhance.Sharpness(scene).enhance(1.12)
  scene=ImageEnhance.Contrast(scene).enhance(1.04)
  canvas=Image.new('RGB',(1536,2048),(5,14,25))
  canvas.paste(scene,(0,0))
  # Extend into a dark atmospheric lower area for the menu panels; seamless gradient.
  arr=np.array(canvas).astype(np.float32)
  for y in range(1400,2048):
    t=(y-1400)/(2048-1400)
    # fade scene into deep navy, slightly more opaque toward the bottom
    factor=max(0.0,1.0-t*1.22)
    base=np.array([5,14,25],dtype=np.float32)
    arr[y,:,:]=arr[y,:,:]*factor + base*(1-factor)
  canvas=Image.fromarray(np.uint8(np.clip(arr,0,255)),'RGB')
  # Gentle bottom vignette for menu readability.
  draw=ImageDraw.Draw(canvas,'RGBA')
  for y in range(1450,2048):
    t=(y-1450)/(2048-1450)
    draw.line((0,y,1535,y),fill=(3,10,20,int(70+130*t)))
  art=ROOT/'public'/'art'
  art.mkdir(parents=True,exist_ok=True)
  canvas.save(art/'title.jpg',quality=94,optimize=True,progressive=True)
  canvas.resize((3072,4096),Image.Resampling.LANCZOS).save(art/'title@2x.jpg',quality=92,optimize=True,progressive=True)

# Inventory of Round 4 touchpoints
entries=[]
for race,names in TOWERS.items():
  for name in names:
    for state in ('t1','t2','t3a','t3b'):
      p=SPR/race/name/f'{state}.png'
      if p.exists():
        im=Image.open(p)
        entries.append({'path':str(p.relative_to(ROOT)),'size':list(im.size),'mode':im.mode})
(ROOT/'art'/'round4-art-inventory.json').parent.mkdir(parents=True,exist_ok=True)
(ROOT/'art'/'round4-art-inventory.json').write_text(json.dumps({'pass':'Round 4 material shading and clean title art','tower_states':entries,'title_size':[1536,2048],'title_2x_size':[3072,4096]},indent=2))
print('processed',len(entries),'tower states')
