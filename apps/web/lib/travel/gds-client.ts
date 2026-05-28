/**
 * GDS (Global Distribution System) client — Amadeus NDC REST API.
 * Phase A: read-only flight and hotel search.
 * Phase B (future): booking write operations.
 *
 * Credentials read from env at call-time so Vercel preview builds succeed
 * even without AMADEUS_* vars set.
 */

import { randomUUID } from "crypto";

export interface FlightSearchParams {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  passengers: number;
  cabinClass?: "ECONOMY" | "PREMIUM_ECONOMY" | "BUSINESS" | "FIRST";
}

export interface HotelSearchParams {
  cityCode: string;
  checkInDate: string;
  checkOutDate: string;
  adults: number;
  roomCount?: number;
}

export interface GDSFlight {
  id: string;
  carrier: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  durationMinutes: number;
  price: number;
  currency: string;
  cabinClass: string;
  availableSeats: number;
  stops: number;
}

export interface GDSHotel {
  id: string;
  name: string;
  cityCode: string;
  checkInDate: string;
  checkOutDate: string;
  pricePerNight: number;
  totalPrice: number;
  currency: string;
  rating: number;
  stars: number;
  amenities: string[];
  address: string;
  supplierCode: string;
}

export interface GDSPricingResult {
  flights: GDSFlight[];
  hotels: GDSHotel[];
  searchTimestamp: string;
  currency: string;
}

export interface ItineraryStop {
  cityCode: string;
  arrivalDate: string;
  departureDate: string;
}

// Internal Amadeus response shapes (only fields we use)
interface AmadeusFlightOffer {
  id?: string;
  numberOfBookableSeats?: number;
  price?: { total?: string; currency?: string };
  itineraries?: Array<{
    duration?: string;
    segments?: Array<{
      carrierCode?: string;
      number?: string;
      departure?: { iataCode?: string; at?: string };
      arrival?: { iataCode?: string; at?: string };
    }>;
  }>;
  travelerPricings?: Array<{
    fareDetailsBySegment?: Array<{ cabin?: string }>;
  }>;
}

interface AmadeusHotelOffer {
  hotel?: {
    hotelId?: string;
    name?: string;
    cityCode?: string;
    rating?: string;
    chainCode?: string;
    amenities?: string[];
    address?: { lines?: string[]; cityName?: string };
  };
  offers?: Array<{
    checkInDate?: string;
    checkOutDate?: string;
    price?: { base?: string; total?: string; currency?: string };
  }>;
}

interface AmadeusTokenResponse {
  access_token: string;
  expires_in: number;
}

export class GDSError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = "GDSError";
  }
}

function parseDuration(isoStr: string): number {
  const match = isoStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] ?? "0", 10);
  const mins = parseInt(match[2] ?? "0", 10);
  return hours * 60 + mins;
}

function calculateNights(checkIn?: string, checkOut?: string): number {
  if (!checkIn || !checkOut) return 1;
  const diff = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  return Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24)));
}

class GDSClient {
  private readonly apiBase: string;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor() {
    this.apiBase =
      process.env.AMADEUS_API_BASE ?? "https://test.api.amadeus.com";
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const clientId = process.env.AMADEUS_CLIENT_ID ?? "";
    const clientSecret = process.env.AMADEUS_CLIENT_SECRET ?? "";

    if (!clientId || !clientSecret) {
      throw new GDSError(
        "Amadeus credentials not configured (AMADEUS_CLIENT_ID / AMADEUS_CLIENT_SECRET)"
      );
    }

    const resp = await fetch(`${this.apiBase}/v1/security/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
      cache: "no-store",
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new GDSError(
        `GDS authentication failed (${resp.status}): ${body}`,
        resp.status
      );
    }

    const data = (await resp.json()) as AmadeusTokenResponse;
    this.accessToken = data.access_token;
    // 60-second buffer to avoid race with expiry
    this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return this.accessToken;
  }

  private async authorizedFetch(
    path: string,
    params: Record<string, string>
  ): Promise<unknown> {
    const token = await this.getAccessToken();
    const url = new URL(`${this.apiBase}${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== "") url.searchParams.set(key, value);
    }

    const resp = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new GDSError(
        `GDS request to ${path} failed (${resp.status}): ${body}`,
        resp.status
      );
    }

    return resp.json();
  }

  private normalizeFlightOffer(offer: AmadeusFlightOffer): GDSFlight {
    const segment = offer.itineraries?.[0]?.segments?.[0];
    const price = parseFloat(offer.price?.total ?? "0");
    return {
      id: offer.id ?? randomUUID(),
      carrier: segment?.carrierCode ?? "XX",
      flightNumber: `${segment?.carrierCode ?? "XX"}${segment?.number ?? "000"}`,
      origin: segment?.departure?.iataCode ?? "",
      destination: segment?.arrival?.iataCode ?? "",
      departureTime: segment?.departure?.at ?? "",
      arrivalTime: segment?.arrival?.at ?? "",
      durationMinutes: parseDuration(
        offer.itineraries?.[0]?.duration ?? "PT0M"
      ),
      price,
      currency: offer.price?.currency ?? "USD",
      cabinClass:
        offer.travelerPricings?.[0]?.fareDetailsBySegment?.[0]?.cabin ??
        "ECONOMY",
      availableSeats: offer.numberOfBookableSeats ?? 9,
      stops: (offer.itineraries?.[0]?.segments?.length ?? 1) - 1,
    };
  }

  private normalizeHotelOffer(offer: AmadeusHotelOffer): GDSHotel {
    const firstOffer = offer.offers?.[0];
    const pricePerNight = parseFloat(
      firstOffer?.price?.base ?? firstOffer?.price?.total ?? "0"
    );
    const nights = calculateNights(
      firstOffer?.checkInDate,
      firstOffer?.checkOutDate
    );
    return {
      id: offer.hotel?.hotelId ?? randomUUID(),
      name: offer.hotel?.name ?? "Unknown Hotel",
      cityCode: offer.hotel?.cityCode ?? "",
      checkInDate: firstOffer?.checkInDate ?? "",
      checkOutDate: firstOffer?.checkOutDate ?? "",
      pricePerNight,
      totalPrice: pricePerNight * nights,
      currency: firstOffer?.price?.currency ?? "USD",
      rating: parseFloat(offer.hotel?.rating ?? "0"),
      stars: parseInt(offer.hotel?.rating ?? "0", 10),
      amenities: offer.hotel?.amenities ?? [],
      address: [
        offer.hotel?.address?.lines?.join(", "),
        offer.hotel?.address?.cityName,
      ]
        .filter(Boolean)
        .join(", "),
      supplierCode: offer.hotel?.chainCode ?? "INDEPENDENT",
    };
  }

  async searchFlights(params: FlightSearchParams): Promise<GDSFlight[]> {
    const queryParams: Record<string, string> = {
      originLocationCode: params.origin,
      destinationLocationCode: params.destination,
      departureDate: params.departureDate,
      adults: String(params.passengers),
      currencyCode: "USD",
      max: "10",
    };
    if (params.returnDate) queryParams.returnDate = params.returnDate;
    if (params.cabinClass) queryParams.travelClass = params.cabinClass;

    const data = (await this.authorizedFetch(
      "/v2/shopping/flight-offers",
      queryParams
    )) as { data?: AmadeusFlightOffer[] };

    return (data.data ?? []).map((offer) => this.normalizeFlightOffer(offer));
  }

  async searchHotels(params: HotelSearchParams): Promise<GDSHotel[]> {
    const queryParams: Record<string, string> = {
      cityCode: params.cityCode,
      checkInDate: params.checkInDate,
      checkOutDate: params.checkOutDate,
      adults: String(params.adults),
      roomQuantity: String(params.roomCount ?? 1),
      currencyCode: "USD",
      bestRateOnly: "true",
      view: "FULL",
    };

    const data = (await this.authorizedFetch(
      "/v3/shopping/hotel-offers",
      queryParams
    )) as { data?: AmadeusHotelOffer[] };

    return (data.data ?? []).map((offer) => this.normalizeHotelOffer(offer));
  }

  async getMultiStopPricing(
    stops: ItineraryStop[],
    travelers: number
  ): Promise<GDSPricingResult> {
    const flightPromises: Promise<GDSFlight[]>[] = [];
    const hotelPromises: Promise<GDSHotel[]>[] = [];

    for (let i = 0; i < stops.length; i++) {
      const stop = stops[i];

      // Inter-city flights (skip last leg — no departure from final stop)
      if (i < stops.length - 1) {
        const nextStop = stops[i + 1];
        flightPromises.push(
          this.searchFlights({
            origin: stop.cityCode,
            destination: nextStop.cityCode,
            departureDate: stop.departureDate,
            passengers: travelers,
            cabinClass: "BUSINESS",
          }).catch((err) => {
            console.error(
              JSON.stringify({
                level: "warn",
                msg: "flight search failed",
                origin: stop.cityCode,
                destination: nextStop.cityCode,
                error: String(err),
              })
            );
            return [];
          })
        );
      }

      // Hotel at each stop
      hotelPromises.push(
        this.searchHotels({
          cityCode: stop.cityCode,
          checkInDate: stop.arrivalDate,
          checkOutDate: stop.departureDate,
          adults: travelers,
        }).catch((err) => {
          console.error(
            JSON.stringify({
              level: "warn",
              msg: "hotel search failed",
              cityCode: stop.cityCode,
              error: String(err),
            })
          );
          return [];
        })
      );
    }

    const [allFlights, allHotels] = await Promise.all([
      Promise.all(flightPromises),
      Promise.all(hotelPromises),
    ]);

    return {
      flights: allFlights.flat(),
      hotels: allHotels.flat(),
      searchTimestamp: new Date().toISOString(),
      currency: "USD",
    };
  }
}

// Module-level singleton — created lazily so Vercel build doesn't need
// Amadeus credentials at bundle time.
let _gdsClient: GDSClient | null = null;

export function getGDSClient(): GDSClient {
  if (!_gdsClient) _gdsClient = new GDSClient();
  return _gdsClient;
}

export const gdsClient = {
  searchFlights: (params: FlightSearchParams) =>
    getGDSClient().searchFlights(params),
  searchHotels: (params: HotelSearchParams) =>
    getGDSClient().searchHotels(params),
  getMultiStopPricing: (stops: ItineraryStop[], travelers: number) =>
    getGDSClient().getMultiStopPricing(stops, travelers),
};
