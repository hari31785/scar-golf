export type Player = {
  id: string;
  name: string;
  initials: string;
  score: string; // e.g. "-4", "+2", "E"
  position: number;
};

export const currentUser = {
  name: "Srikanth",
  initials: "SR",
  handicap: 8.2,
  championshipsPlayed: 5,
};

export const currentChampionship = {
  name: "SCAR Championship 2027",
  round: 2,
  totalRounds: 4,
  teeTime: "8:12 AM",
  groupNumber: 14,
  course: "Pinehurst No. 4",
};

export const leaderboardPreview: Player[] = [
  { id: "1", name: "Aditya Rao", initials: "AR", score: "-6", position: 1 },
  { id: "2", name: "Marcus Lee", initials: "ML", score: "-4", position: 2 },
  { id: "3", name: "Srikanth", initials: "SR", score: "-2", position: 3 },
];
