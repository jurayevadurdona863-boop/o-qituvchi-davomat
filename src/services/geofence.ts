import { COLLEGE_CONFIG } from '../types/attendance';

/**
 * Calculates distance between two GPS coordinates in meters using the Haversine formula
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export function isInsideCollege(lat: number, lng: number): boolean {
  const dist = calculateDistanceMeters(
    COLLEGE_CONFIG.latitude,
    COLLEGE_CONFIG.longitude,
    lat,
    lng
  );
  return dist <= COLLEGE_CONFIG.radiusMeters;
}

export interface PresetLocation {
  id: string;
  label: string;
  description: string;
  lat: number;
  lng: number;
  expectedDistance: number;
  isInside: boolean;
}

export const PRESET_LOCATIONS: PresetLocation[] = [
  {
    id: 'center',
    label: "Kollej markazi (Bosh bino)",
    description: "Kollej ichida, koordinata markazi",
    lat: 38.971199,
    lng: 66.707470,
    expectedDistance: 0,
    isInside: true,
  },
  {
    id: 'entrance',
    label: "Kollej asosiy darvozasi",
    description: "Kirish posti va nazorat maskani (~90m)",
    lat: 38.971750,
    lng: 66.708100,
    expectedDistance: 82,
    isInside: true,
  },
  {
    id: 'sports',
    label: "Sport maydoni (Hudud cheti)",
    description: "Kollej stadioni va sport zali (~320m)",
    lat: 38.969200,
    lng: 66.705600,
    expectedDistance: 275,
    isInside: true,
  },
  {
    id: 'border_edge',
    label: "Perimetr chegarasi (~460m)",
    description: "Ruxsat etilgan 500m radiusning eng chekka nuqtasi",
    lat: 38.974500,
    lng: 66.710200,
    expectedDistance: 435,
    isInside: true,
  },
  {
    id: 'outside_nearby',
    label: "Tashqarida: Bekat / Do'kon (~780m)",
    description: "Geozonadan tashqari, 500m chegarasidan o'tgan",
    lat: 38.977200,
    lng: 66.712500,
    expectedDistance: 795,
    isInside: false,
  },
  {
    id: 'outside_city',
    label: "Shahar markazi (Uyda / Yo'lda ~3.4km)",
    description: "Kollejdan uzoqda, davomat bloklanadi yoki ogohlantiriladi",
    lat: 38.995000,
    lng: 66.735000,
    expectedDistance: 3500,
    isInside: false,
  },
];
