// Extra Terram — src/render/seats.ts v0.2.0 — side colours for versus boards (a player's own, or the team's)
// Seat 0 is the host. The colours sit apart from the sap green and the rust red the HUD already uses.
export const SEAT_COLORS = ['#f2c14e', '#5ad1ff', '#ff7ab6', '#b58cff'] as const;
export const SEAT_COLORS_HEX = [0xf2c14e, 0x5ad1ff, 0xff7ab6, 0xb58cff] as const;

export function seatColor(seat: number): string {
  return SEAT_COLORS[((seat % SEAT_COLORS.length) + SEAT_COLORS.length) % SEAT_COLORS.length];
}

export function seatColorHex(seat: number): number {
  return SEAT_COLORS_HEX[((seat % SEAT_COLORS_HEX.length) + SEAT_COLORS_HEX.length) % SEAT_COLORS_HEX.length];
}

/** A versus side's colour: its player's seat colour, or in 2 v 2 the team's (seat 0's for team 1, seat 1's for team 2). */
export function sideColorIndex(teams: boolean, side: number, firstSeat: number): number {
  return teams ? side : firstSeat;
}
