export interface NeighborhoodBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface Neighborhood {
  id: string;
  name: string;
  color: string;
  bounds: NeighborhoodBounds;
}

const PINK = '#EC4899';
const BLUE = '#3B82F6';
const GREEN = '#10B981';
const ORANGE = '#F59E0B';
const PURPLE = '#8B5CF6';
const TEAL = '#14B8A6';
const RED = '#EF4444';
const INDIGO = '#6366F1';
const ROSE = '#F43F5E';
const CYAN = '#06B6D4';
const AMBER = '#D97706';
const LIME = '#65A30D';
const SKY = '#0284C7';
const VIOLET = '#7C3AED';
const EMERALD = '#059669';
const FUCHSIA = '#D946EF';
const YELLOW = '#CA8A04';

export const NEIGHBORHOODS: Neighborhood[] = [
  {
    id: 'la_plata',
    name: 'La Plata',
    color: PINK,
    bounds: { south: -34.954, west: -57.994, north: -34.888, east: -57.913 },
  },
  {
    id: 'tolosa',
    name: 'Tolosa',
    color: BLUE,
    bounds: { south: -34.896, west: -57.978, north: -34.868, east: -57.956 },
  },
  {
    id: 'los_hornos',
    name: 'Los Hornos',
    color: GREEN,
    bounds: { south: -35.005, west: -58.035, north: -34.938, east: -57.960 },
  },
  {
    id: 'ringuelet',
    name: 'Ringuelet',
    color: ORANGE,
    bounds: { south: -34.890, west: -58.005, north: -34.872, east: -57.978 },
  },
  {
    id: 'gonnet',
    name: 'Manuel B. Gonnet',
    color: PURPLE,
    bounds: { south: -34.885, west: -58.022, north: -34.870, east: -58.008 },
  },
  {
    id: 'city_bell',
    name: 'City Bell',
    color: TEAL,
    bounds: { south: -34.875, west: -58.055, north: -34.855, east: -58.040 },
  },
  {
    id: 'villa_elisa',
    name: 'Villa Elisa',
    color: RED,
    bounds: { south: -34.860, west: -58.125, north: -34.830, east: -58.090 },
  },
  {
    id: 'villa_elvira',
    name: 'Villa Elvira',
    color: INDIGO,
    bounds: { south: -34.980, west: -57.935, north: -34.920, east: -57.850 },
  },
  {
    id: 'abasto',
    name: 'Abasto',
    color: ROSE,
    bounds: { south: -34.995, west: -58.118, north: -34.935, east: -58.082 },
  },
  {
    id: 'san_carlos',
    name: 'San Carlos',
    color: CYAN,
    bounds: { south: -34.950, west: -57.958, north: -34.910, east: -57.930 },
  },
  {
    id: 'altos_san_lorenzo',
    name: 'Altos de San Lorenzo',
    color: AMBER,
    bounds: { south: -34.990, west: -57.960, north: -34.937, east: -57.910 },
  },
  {
    id: 'olmos',
    name: 'Lisandro Olmos',
    color: LIME,
    bounds: { south: -34.990, west: -58.030, north: -34.940, east: -57.970 },
  },
  {
    id: 'melchor_romero',
    name: 'Melchor Romero',
    color: SKY,
    bounds: { south: -34.960, west: -58.075, north: -34.910, east: -58.025 },
  },
  {
    id: 'gorina',
    name: 'Joaquín Gorina',
    color: VIOLET,
    bounds: { south: -34.925, west: -58.060, north: -34.888, east: -58.035 },
  },
  {
    id: 'arana',
    name: 'Eduardo Arana',
    color: EMERALD,
    bounds: { south: -34.970, west: -57.885, north: -34.925, east: -57.845 },
  },
  {
    id: 'etcheverry',
    name: 'Ángel Etcheverry',
    color: FUCHSIA,
    bounds: { south: -35.035, west: -58.040, north: -34.995, east: -57.995 },
  },
  {
    id: 'arturo_segui',
    name: 'Arturo Seguí',
    color: YELLOW,
    bounds: { south: -34.895, west: -58.140, north: -34.858, east: -58.118 },
  },
  {
    id: 'el_peligro',
    name: 'El Peligro',
    color: PINK,
    bounds: { south: -34.995, west: -58.220, north: -34.950, east: -58.170 },
  },
  {
    id: 'jose_hernandez',
    name: 'José Hernández',
    color: BLUE,
    bounds: { south: -34.910, west: -58.058, north: -34.888, east: -58.028 },
  },
  {
    id: 'garibaldi_sicardi',
    name: 'Villa Garibaldi - P. Sicardi',
    color: TEAL,
    bounds: { south: -35.008, west: -57.900, north: -34.960, east: -57.850 },
  },
  {
    id: 'ignacio_correas',
    name: 'Ignacio Correas',
    color: ORANGE,
    bounds: { south: -35.045, west: -57.870, north: -35.012, east: -57.838 },
  },
];
