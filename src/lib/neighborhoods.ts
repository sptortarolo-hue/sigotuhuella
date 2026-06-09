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
    center: { lat: -34.9155, lng: -57.9480 },
    bounds: { south: -34.930, west: -57.962, north: -34.901, east: -57.934 },
  },
  {
    id: 'tolosa',
    name: 'Tolosa',
    color: BLUE,
    center: { lat: -34.8918, lng: -57.9742 },
    bounds: { south: -34.905, west: -57.990, north: -34.878, east: -57.958 },
  },
  {
    id: 'los_hornos',
    name: 'Los Hornos',
    color: GREEN,
    center: { lat: -34.9594, lng: -57.9807 },
    bounds: { south: -34.978, west: -58.005, north: -34.941, east: -57.956 },
  },
  {
    id: 'ringuelet',
    name: 'Ringuelet',
    color: ORANGE,
    center: { lat: -34.8848, lng: -57.9915 },
    bounds: { south: -34.897, west: -58.005, north: -34.872, east: -57.978 },
  },
  {
    id: 'gonnet',
    name: 'Manuel B. Gonnet',
    color: PURPLE,
    center: { lat: -34.8819, lng: -58.0103 },
    bounds: { south: -34.895, west: -58.025, north: -34.868, east: -57.996 },
  },
  {
    id: 'city_bell',
    name: 'City Bell',
    color: TEAL,
    center: { lat: -34.8675, lng: -58.0474 },
    bounds: { south: -34.882, west: -58.062, north: -34.853, east: -58.033 },
  },
  {
    id: 'villa_elisa',
    name: 'Villa Elisa',
    color: RED,
    center: { lat: -34.8515, lng: -58.0854 },
    bounds: { south: -34.866, west: -58.100, north: -34.837, east: -58.071 },
  },
  {
    id: 'villa_elvira',
    name: 'Villa Elvira',
    color: INDIGO,
    center: { lat: -34.9394, lng: -57.9208 },
    bounds: { south: -34.962, west: -57.938, north: -34.918, east: -57.902 },
  },
  {
    id: 'barrio_aeropuerto',
    name: 'Barrio Aeropuerto',
    color: AMBER,
    center: { lat: -34.968, lng: -57.893 },
    bounds: { south: -34.976, west: -57.900, north: -34.960, east: -57.886 },
  },
  {
    id: 'abasto',
    name: 'Abasto',
    color: ROSE,
    center: { lat: -34.9868, lng: -58.0909 },
    bounds: { south: -35.010, west: -58.115, north: -34.964, east: -58.067 },
  },
  {
    id: 'san_carlos',
    name: 'San Carlos',
    color: CYAN,
    center: { lat: -34.933, lng: -58.000 },
    bounds: { south: -34.955, west: -58.020, north: -34.910, east: -57.980 },
  },
  {
    id: 'altos_san_lorenzo',
    name: 'Altos de San Lorenzo',
    color: AMBER,
    center: { lat: -34.954, lng: -57.931 },
    bounds: { south: -34.977, west: -57.945, north: -34.929, east: -57.917 },
  },
  {
    id: 'olmos',
    name: 'Lisandro Olmos',
    color: LIME,
    center: { lat: -34.9991, lng: -58.0486 },
    bounds: { south: -35.018, west: -58.068, north: -34.980, east: -58.029 },
  },
  {
    id: 'melchor_romero',
    name: 'Melchor Romero',
    color: SKY,
    center: { lat: -34.9457, lng: -58.0365 },
    bounds: { south: -34.965, west: -58.060, north: -34.928, east: -58.015 },
  },
  {
    id: 'gorina',
    name: 'Joaquín Gorina',
    color: VIOLET,
    center: { lat: -34.9054, lng: -58.0436 },
    bounds: { south: -34.920, west: -58.062, north: -34.890, east: -58.025 },
  },
  {
    id: 'arana',
    name: 'Eduardo Arana',
    color: EMERALD,
    center: { lat: -34.9996, lng: -57.8925 },
    bounds: { south: -35.015, west: -57.905, north: -34.980, east: -57.878 },
  },
  {
    id: 'etcheverry',
    name: 'Ángel Etcheverry',
    color: FUCHSIA,
    center: { lat: -35.0245, lng: -58.0781 },
    bounds: { south: -35.045, west: -58.098, north: -35.004, east: -58.058 },
  },
  {
    id: 'arturo_segui',
    name: 'Arturo Seguí',
    color: YELLOW,
    center: { lat: -34.8913, lng: -58.1319 },
    bounds: { south: -34.908, west: -58.153, north: -34.874, east: -58.110 },
  },
  {
    id: 'el_peligro',
    name: 'El Peligro',
    color: PINK,
    center: { lat: -34.9333, lng: -58.1667 },
    bounds: { south: -34.955, west: -58.195, north: -34.912, east: -58.138 },
  },
  {
    id: 'jose_hernandez',
    name: 'José Hernández',
    color: BLUE,
    center: { lat: -34.8989, lng: -58.0106 },
    bounds: { south: -34.912, west: -58.028, north: -34.885, east: -57.994 },
  },
  {
    id: 'parque_sicardi',
    name: 'Parque Sicardi',
    color: TEAL,
    center: { lat: -34.9875, lng: -57.8598 },
    bounds: { south: -34.995, west: -57.870, north: -34.980, east: -57.850 },
  },
  {
    id: 'villa_garibaldi',
    name: 'Villa Garibaldi',
    color: BLUE,
    center: { lat: -34.9990, lng: -57.8584 },
    bounds: { south: -35.018, west: -57.870, north: -34.993, east: -57.845 },
  },
  {
    id: 'ignacio_correas',
    name: 'Ignacio Correas',
    color: ORANGE,
    center: { lat: -35.0489, lng: -57.8500 },
    bounds: { south: -35.060, west: -57.865, north: -35.025, east: -57.835 },
  },
];
