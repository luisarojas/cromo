// Curated NOTABLE players per team — used ONLY for sample/mock mode. In live
// mode the real 26-man squad comes from the provider (`fetchLiveSquads`). These
// are real, widely-known names; we deliberately carry NO club (it goes stale and
// the live source doesn't supply it either). Teams without an entry return [].
// Positions: GK / DF / MF / FW.

import { clubFor } from './player-clubs.js';
import type { WcPlayer } from './types.js';

// Third tuple element is the player's former-club label — RETAINED ONLY as a
// human cross-reference while editing this file; it is NOT emitted (clubs go
// stale). Drop it entirely if it ever tempts anyone to render it.
type P = [name: string, position: string, _clubRef: string];

const RAW: Record<string, P[]> = {
  ARG: [
    ['Lionel Messi', 'FW', 'Inter Miami'],
    ['Lautaro Martínez', 'FW', 'Inter'],
    ['Julián Álvarez', 'FW', 'Atlético Madrid'],
    ['Enzo Fernández', 'MF', 'Chelsea'],
    ['Emiliano Martínez', 'GK', 'Aston Villa'],
  ],
  FRA: [
    ['Kylian Mbappé', 'FW', 'Real Madrid'],
    ['Aurélien Tchouaméni', 'MF', 'Real Madrid'],
    ['Antoine Griezmann', 'FW', 'Atlético Madrid'],
    ['William Saliba', 'DF', 'Arsenal'],
    ['Mike Maignan', 'GK', 'Milan'],
  ],
  ESP: [
    ['Lamine Yamal', 'FW', 'Barcelona'],
    ['Rodri', 'MF', 'Manchester City'],
    ['Pedri', 'MF', 'Barcelona'],
    ['Nico Williams', 'FW', 'Athletic Club'],
    ['Unai Simón', 'GK', 'Athletic Club'],
  ],
  ENG: [
    ['Jude Bellingham', 'MF', 'Real Madrid'],
    ['Harry Kane', 'FW', 'Bayern Munich'],
    ['Bukayo Saka', 'FW', 'Arsenal'],
    ['Declan Rice', 'MF', 'Arsenal'],
    ['Jordan Pickford', 'GK', 'Everton'],
  ],
  BRA: [
    ['Vinícius Júnior', 'FW', 'Real Madrid'],
    ['Rodrygo', 'FW', 'Real Madrid'],
    ['Raphinha', 'FW', 'Barcelona'],
    ['Bruno Guimarães', 'MF', 'Newcastle'],
    ['Alisson', 'GK', 'Liverpool'],
  ],
  POR: [
    ['Cristiano Ronaldo', 'FW', 'Al Nassr'],
    ['Bruno Fernandes', 'MF', 'Manchester United'],
    ['Rafael Leão', 'FW', 'Milan'],
    ['Bernardo Silva', 'MF', 'Manchester City'],
    ['Diogo Costa', 'GK', 'Porto'],
  ],
  NED: [
    ['Virgil van Dijk', 'DF', 'Liverpool'],
    ['Cody Gakpo', 'FW', 'Liverpool'],
    ['Frenkie de Jong', 'MF', 'Barcelona'],
    ['Memphis Depay', 'FW', 'Corinthians'],
  ],
  GER: [
    ['Jamal Musiala', 'MF', 'Bayern Munich'],
    ['Florian Wirtz', 'MF', 'Bayer Leverkusen'],
    ['Kai Havertz', 'FW', 'Arsenal'],
    ['Joshua Kimmich', 'MF', 'Bayern Munich'],
  ],
  BEL: [
    ['Kevin De Bruyne', 'MF', 'Napoli'],
    ['Romelu Lukaku', 'FW', 'Napoli'],
    ['Jérémy Doku', 'FW', 'Manchester City'],
  ],
  CRO: [
    ['Luka Modrić', 'MF', 'Milan'],
    ['Joško Gvardiol', 'DF', 'Manchester City'],
    ['Mateo Kovačić', 'MF', 'Manchester City'],
  ],
  URU: [
    ['Federico Valverde', 'MF', 'Real Madrid'],
    ['Darwin Núñez', 'FW', 'Liverpool'],
    ['Ronald Araújo', 'DF', 'Barcelona'],
  ],
  USA: [
    ['Christian Pulisic', 'FW', 'Milan'],
    ['Weston McKennie', 'MF', 'Juventus'],
    ['Antonee Robinson', 'DF', 'Fulham'],
  ],
  CAN: [
    ['Alphonso Davies', 'DF', 'Bayern Munich'],
    ['Jonathan David', 'FW', 'Lille'],
  ],
  MEX: [
    ['Santiago Giménez', 'FW', 'Milan'],
    ['Edson Álvarez', 'MF', 'West Ham'],
  ],
  COL: [
    ['Luis Díaz', 'FW', 'Bayern Munich'],
    ['James Rodríguez', 'MF', 'León'],
  ],
  MAR: [
    ['Achraf Hakimi', 'DF', 'Paris Saint-Germain'],
    ['Brahim Díaz', 'MF', 'Real Madrid'],
  ],
  NOR: [
    ['Erling Haaland', 'FW', 'Manchester City'],
    ['Martin Ødegaard', 'MF', 'Arsenal'],
  ],
  JPN: [
    ['Takefusa Kubo', 'FW', 'Real Sociedad'],
    ['Kaoru Mitoma', 'FW', 'Brighton'],
  ],
  SEN: [
    ['Sadio Mané', 'FW', 'Al Nassr'],
    ['Nicolas Jackson', 'FW', 'Chelsea'],
  ],
};

export function playersFor(code: string): WcPlayer[] {
  return (RAW[code] ?? []).map(([name, position]) => ({ name, position, age: null, club: clubFor(name, code) }));
}
