// Extra Terram — src/render/seats.ts v0.1.0 — one colour per seat, shared by the board and the HUD
// Seat 0 is the host. The colours sit apart from the sap green and the rust red the HUD already uses.
export const SEAT_COLORS = ['#f2c14e', '#5ad1ff', '#ff7ab6', '#b58cff'] as const;
export const SEAT_COLORS_HEX = [0xf2c14e, 0x5ad1ff, 0xff7ab6, 0xb58cff] as const;

export function seatColor(seat: number): string {
  return SEAT_COLORS[((seat % SEAT_COLORS.length) + SEAT_COLORS.length) % SEAT_COLORS.length];
}

export function seatColorHex(seat: number): number {
  return SEAT_COLORS_HEX[((seat % SEAT_COLORS_HEX.length) + SEAT_COLORS_HEX.length) % SEAT_COLORS_HEX.length];
}
