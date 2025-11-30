// js/fresnel.js
class FresnelCalculator {
    constructor() {
        this.SPEED_OF_LIGHT = 3e8; // m/s
    }

    analyzeLink(link) {
        if (!link || !link.fromTower || !link.toTower) {
            throw new Error('Invalid link for Fresnel analysis');
        }

        const frequencyGHz = parseFloat(link.frequency || link.fromTower.frequency);
        if (isNaN(frequencyGHz) || frequencyGHz <= 0) {
            throw new Error('Invalid frequency for Fresnel analysis');
        }

        const frequencyHz = frequencyGHz * 1e9;
        const wavelength = this.SPEED_OF_LIGHT / frequencyHz; // meters

        const totalDistanceMeters = this.calculateDistance(link.fromTower, link.toTower) * 1000;

        const midpoint = {
            lat: (link.fromTower.lat + link.toTower.lat) / 2,
            lng: (link.fromTower.lng + link.toTower.lng) / 2
        };

        const D = totalDistanceMeters;
        const maxRadius = D <= 0 ? 0 : 0.5 * Math.sqrt(wavelength * D);

        const points = this.calculateFresnelPoints(link, wavelength, totalDistanceMeters);

        return {
            frequency: frequencyGHz,
            wavelength: wavelength,
            distance: totalDistanceMeters,
            distanceKm: totalDistanceMeters / 1000,
            maxRadius: maxRadius,
            midpoint,
            points
        };
    }

    calculateFresnelRadius(wavelength, d1, d2) {
        if (d1 + d2 === 0) return 0;
        return Math.sqrt((wavelength * d1 * d2) / (d1 + d2));
    }

    calculateFresnelPoints(link, wavelength, totalDistance) {
        const pts = [];
        const steps = 24;
        for (let i = 0; i <= steps; i++) {
            const f = i / steps;
            const d1 = totalDistance * f;
            const d2 = totalDistance * (1 - f);
            const r = this.calculateFresnelRadius(wavelength, d1, d2);

            const lat = link.fromTower.lat + (link.toTower.lat - link.fromTower.lat) * f;
            const lng = link.fromTower.lng + (link.toTower.lng - link.fromTower.lng) * f;

            pts.push({ lat, lng, radius: r, distanceFromStart: d1 });
        }
        return pts;
    }

    calculateDistance(t1, t2) {
        const R = 6371;
        const dLat = this.deg2rad(t2.lat - t1.lat);
        const dLng = this.deg2rad(t2.lng - t1.lng);

        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.deg2rad(t1.lat)) * Math.cos(this.deg2rad(t2.lat)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    deg2rad(deg) { return deg * (Math.PI / 180); }
}
