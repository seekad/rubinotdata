export type GainRow = {
  name: string;
  level: number | null;
  vocation: string | null;
  voc_id?: number | null;
  rank: number | null;
  experience: number | null;
  xp_gained: number | null;
  levels_gained: number | null;
};

export type GainsResult = {
  world: string;
  day: string | null;
  prevDay: string | null;
  rows: GainRow[];
};

export type BoardRow = {
  name: string;
  level: number | null;
  vocation: string | null;
  experience: number | null;
};

export type PlayerPoint = {
  name?: string;
  game_day: string;
  level: number | null;
  experience: number | null;
  xp_gained: number | null;
};
