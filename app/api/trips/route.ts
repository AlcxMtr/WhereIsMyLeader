import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';

export const dynamic = 'force-dynamic';

interface Trip {
  id: number;
  city: string;
  coords: [number, number];
  arrival: string;
  departure: string;
  desc: string;
}

// 1. Helper function to clean strings for reliable comparison
function normalizeLocation(loc: string): string {
  if (!loc) return "";
  return loc
    .toLowerCase()
    .replace(/['’]/g, "") // Strip all apostrophes (straight and curly)
    .replace(/[^\w\s]/g, "") // Strip all other punctuation
    .trim();
}

// 2. Helper to get just the primary city from a "City A / City B" string
function getPrimaryCity(loc: string): string {
  if (!loc) return "";
  return loc.split('/')[0].trim();
}

export async function GET() {
  try {
    const isDocker = process.env.NODE_ENV === 'production';
    const dbPath = isDocker 
      ? path.join('/app/data', 'trips.db') 
      : path.resolve('../shared-data/trips.db');

    const db = new Database(dbPath, { readonly: true });

    const rows = db.prepare(`
      SELECT date, location, activities, lat, lng 
      FROM trips 
      ORDER BY date ASC
    `).all() as { date: string, location: string, activities: string, lat: number | null, lng: number | null }[];

    db.close();

    if (rows.length === 0) {
      return NextResponse.json([]);
    }

    const aggregatedTrips: Trip[] = [];
    let currentTrip: Trip | null = null;
    let tripIdCounter = 1;

    for (const row of rows) {
      let parsedActivities: string[] = [];
      try {
        parsedActivities = JSON.parse(row.activities);
      } catch (e) {
        parsedActivities = [row.activities]; 
      }

      const dailyDesc = parsedActivities.join('. ') + '.';
      
      // We extract the primary city (e.g., "Beijing" out of "Beijing / Doha")
      const rawPrimaryCity = getPrimaryCity(row.location);
      const normalizedRowCity = normalizeLocation(rawPrimaryCity);

      if (!currentTrip) {
        currentTrip = {
          id: tripIdCounter++,
          city: rawPrimaryCity, // Use the clean primary city name for display
          coords: [row.lat || 0, row.lng || 0], 
          arrival: row.date,
          departure: row.date,
          desc: dailyDesc
        };
      } else {
        // Compare the normalized versions of the cities
        const normalizedCurrentCity = normalizeLocation(currentTrip.city);

        if (normalizedCurrentCity === normalizedRowCity) {
          // It's the same city! Extend the stay.
          currentTrip.departure = row.date;
          if (!currentTrip.desc.includes(dailyDesc)) {
              currentTrip.desc += ` ${dailyDesc}`;
          }
        } else {
          // It's a new city. Save the current trip and start a new one.
          aggregatedTrips.push(currentTrip);
          currentTrip = {
            id: tripIdCounter++,
            city: rawPrimaryCity,
            coords: [row.lat || 0, row.lng || 0],
            arrival: row.date,
            departure: row.date,
            desc: dailyDesc
          };
        }
      }
    }

    if (currentTrip) {
      aggregatedTrips.push(currentTrip);
    }

    return NextResponse.json(aggregatedTrips);

  } catch (error: unknown) {
    console.error("Database Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown database error";
    return NextResponse.json(
      { error: "Failed to fetch trips data", details: errorMessage }, 
      { status: 500 }
    );
  }
}