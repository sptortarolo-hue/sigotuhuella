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
  center: { lat: number; lng: number };
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
    center: { lat: -34.921, lng: -57.954 },
    bounds: { south: -34.951, west: -57.990, north: -34.891, east: -57.918 },
  },
  {
    id: 'tolosa',
    name: 'Tolosa',
    color: BLUE,
    center: { lat: -34.876, lng: -57.968 },
    bounds: { south: -34.896, west: -57.988, north: -34.856, east: -57.948 },
  },
  {
    id: 'los_hornos',
    name: 'Los Hornos',
    color: GREEN,
    center: { lat: -34.968, lng: -57.982 },
    bounds: { south: -35.000, west: -58.030, north: -34.936, east: -57.950 },
  },
  {
    id: 'ringuelet',
    name: 'Ringuelet',
    color: ORANGE,
    center: { lat: -34.881, lng: -57.986 },
    bounds: { south: -34.896, west: -58.005, north: -34.866, east: -57.970 },
  },
  {
    id: 'gonnet',
    name: 'Manuel B. Gonnet',
    color: PURPLE,
    center: { lat: -34.877, lng: -58.016 },
    bounds: { south: -34.892, west: -58.032, north: -34.862, east: -58.000 },
  },
  {
    id: 'city_bell',
    name: 'City Bell',
    color: TEAL,
    center: { lat: -34.867, lng: -58.047 },
    bounds: { south: -34.883, west: -58.063, north: -34.851, east: -58.031 },
  },
  {
    id: 'villa_elisa',
    name: 'Villa Elisa',
    color: RED,
    center: { lat: -34.845, lng: -58.104 },
    bounds: { south: -34.865, west: -58.124, north: -34.825, east: -58.084 },
  },
  {
    id: 'villa_elvira',
    name: 'Villa Elvira',
    color: INDIGO,
    center: { lat: -34.952, lng: -57.888 },
    bounds: { south: -34.982, west: -57.930, north: -34.922, east: -57.855 },
  },
  {
    id: 'abasto',
    name: 'Abasto',
    color: ROSE,
    center: { lat: -34.966, lng: -58.101 },
    bounds: { south: -34.996, west: -58.131, north: -34.936, east: -58.071 },
  },
  {
    id: 'san_carlos',
    name: 'San Carlos',
    color: CYAN,
    center: { lat: -34.925, lng: -57.945 },
    bounds: { south: -34.950, west: -57.970, north: -34.900, east: -57.920 },
  },
  {
    id: 'altos_san_lorenzo',
    name: 'Altos de San Lorenzo',
    color: AMBER,
    center: { lat: -34.960, lng: -57.935 },
    bounds: { south: -34.990, west: -57.960, north: -34.930, east: -57.910 },
  },
  {
    id: 'olmos',
    name: 'Lisandro Olmos',
    color: LIME,
    center: { lat: -34.962, lng: -57.997 },
    bounds: { south: -34.990, west: -58.035, north: -34.934, east: -57.965 },
  },
  {
    id: 'melchor_romero',
    name: 'Melchor Romero',
    color: SKY,
    center: { lat: -34.935, lng: -58.042 },
    bounds: { south: -34.958, west: -58.065, north: -34.912, east: -58.015 },
  },
  {
    id: 'gorina',
    name: 'Joaquín Gorina',
    color: VIOLET,
    center: { lat: -34.902, lng: -58.049 },
    bounds: { south: -34.922, west: -58.068, north: -34.882, east: -58.030 },
  },
  {
    id: 'arana',
    name: 'Eduardo Arana',
    color: EMERALD,
    center: { lat: -34.947, lng: -57.865 },
    bounds: { south: -34.972, west: -57.890, north: -34.922, east: -57.840 },
  },
  {
    id: 'etcheverry',
    name: 'Ángel Etcheverry',
    color: FUCHSIA,
    center: { lat: -35.015, lng: -58.018 },
    bounds: { south: -35.040, west: -58.045, north: -34.990, east: -57.995 },
  },
  {
    id: 'arturo_segui',
    name: 'Arturo Seguí',
    color: YELLOW,
    center: { lat: -34.877, lng: -58.134 },
    bounds: { south: -34.897, west: -58.154, north: -34.857, east: -58.114 },
  },
  {
    id: 'el_peligro',
    name: 'El Peligro',
    color: PINK,
    center: { lat: -34.973, lng: -58.196 },
    bounds: { south: -35.005, west: -58.228, north: -34.941, east: -58.164 },
  },
  {
    id: 'jose_hernandez',
    name: 'José Hernández',
    color: BLUE,
    center: { lat: -34.898, lng: -58.038 },
    bounds: { south: -34.916, west: -58.055, north: -34.880, east: -58.020 },
  },
  {
    id: 'garibaldi_sicardi',
    name: 'Villa Garibaldi - P. Sicardi',
    color: TEAL,
    center: { lat: -34.982, lng: -57.882 },
    bounds: { south: -35.020, west: -57.920, north: -34.945, east: -57.845 },
  },
  {
    id: 'ignacio_correas',
    name: 'Ignacio Correas',
    color: ORANGE,
    center: { lat: -35.028, lng: -57.855 },
    bounds: { south: -35.055, west: -57.880, north: -35.001, east: -57.830 },
  },
];
