// The 16 host cities of the FIFA World Cup 2026 (USA / Canada / Mexico) with
// their stadiums. `tz` is the IANA zone of the venue — the frontend converts
// kickoff (stored UTC) to America/New_York (EST/EDT) for display, but the zone
// is kept here so a future "local time" toggle has the data.

export interface Venue {
  city: string;
  stadium: string;
  tz: string;
}

export const VENUES: Venue[] = [
  { city: 'New York / New Jersey', stadium: 'MetLife Stadium', tz: 'America/New_York' },
  { city: 'Dallas', stadium: 'AT&T Stadium', tz: 'America/Chicago' },
  { city: 'Kansas City', stadium: 'Arrowhead Stadium', tz: 'America/Chicago' },
  { city: 'Houston', stadium: 'NRG Stadium', tz: 'America/Chicago' },
  { city: 'Atlanta', stadium: 'Mercedes-Benz Stadium', tz: 'America/New_York' },
  { city: 'Boston', stadium: 'Gillette Stadium', tz: 'America/New_York' },
  { city: 'Philadelphia', stadium: 'Lincoln Financial Field', tz: 'America/New_York' },
  { city: 'Miami', stadium: 'Hard Rock Stadium', tz: 'America/New_York' },
  { city: 'Los Angeles', stadium: 'SoFi Stadium', tz: 'America/Los_Angeles' },
  { city: 'San Francisco Bay Area', stadium: "Levi's Stadium", tz: 'America/Los_Angeles' },
  { city: 'Seattle', stadium: 'Lumen Field', tz: 'America/Los_Angeles' },
  { city: 'Vancouver', stadium: 'BC Place', tz: 'America/Vancouver' },
  { city: 'Toronto', stadium: 'BMO Field', tz: 'America/Toronto' },
  { city: 'Mexico City', stadium: 'Estadio Azteca', tz: 'America/Mexico_City' },
  { city: 'Guadalajara', stadium: 'Estadio Akron', tz: 'America/Mexico_City' },
  { city: 'Monterrey', stadium: 'Estadio BBVA', tz: 'America/Monterrey' },
];

export function venueAt(index: number): Venue {
  return VENUES[index % VENUES.length];
}
