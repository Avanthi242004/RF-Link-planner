// js/map.js
class MapManager {
    constructor(mapElementId, app) {
        this.mapElementId = mapElementId;
        this.app = app;
        this.map = null;
        this.towerMarkers = new Map();
        this.linkLines = new Map();
        this.tempLine = null;

        // smoothing handlers
        this._boundMouse = null;
        this._lastMouseLatLng = null;
        this._raf = null;

        // store previous interaction states so we can restore them
        this._prevInteraction = null;

        this._fresnelLayer = null;

        this.initMap();
    }

    initMap() {
        this.map = L.map(this.mapElementId, { preferCanvas: true }).setView([12.9716, 77.5946], 13);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.map);

        this.map.on('click', (e) => this.handleMapClick(e));
        this.map.on('mousemove', (e) => this.updateCoordinates(e.latlng));
    }

    handleMapClick(e) {
        const { lat, lng } = e.latlng;
        if (this.app.currentMode === 'add-tower') {
            this.app.addTower(lat, lng);
        }
    }

    /* ------------------ Tower markers ------------------ */
    addTowerMarker(tower) {
        const marker = L.circleMarker([tower.lat, tower.lng], {
            color: '#2563eb',
            fillColor: '#3b82f6',
            fillOpacity: 0.95,
            radius: 8,
            weight: 2,
            interactive: true
        }).addTo(this.map);

        marker.bindPopup(this._towerPopupHtml(tower));

        const handleSelectAndLink = (domEvent) => {
            try {
                L.DomEvent.stopPropagation(domEvent);
                L.DomEvent.preventDefault(domEvent);
            } catch (e) {}

            if (this.app && typeof this.app.selectTower === 'function') {
                try { this.app.selectTower(tower); } catch (e) { console.warn('selectTower error', e); }
            }

            if (this.app && this.app.currentMode === 'add-link' && this.app.linkManager) {
                if (!this.app.linkManager.tempLink) {
                    try { this.app.startLinkCreation(tower); } catch (e) { console.warn('startLinkCreation error', e); }
                } else {
                    try { this.app.completeLinkCreation(tower); } catch (e) { console.warn('completeLinkCreation error', e); }
                }
            }

            try { marker.bringToFront(); } catch (e) {}
        };

        // attach pointerdown to underlying DOM element where possible
        const el = marker.getElement && marker.getElement();
        if (el) {
            el.addEventListener('pointerdown', (ev) => {
                handleSelectAndLink(ev);
            }, { passive: false });
        } else {
            // fallback to mousedown if getElement not available
            marker.on('mousedown', (e) => {
                L.DomEvent.stopPropagation(e);
                L.DomEvent.preventDefault(e);
                handleSelectAndLink(e);
            });
        }

        // keep click as fallback
        marker.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            handleSelectAndLink(e);
        });

        this.towerMarkers.set(tower.id, marker);
    }

    _towerPopupHtml(tower) {
        return `
            <div class="tower-popup">
                <h4>${tower.name}</h4>
                <p>Frequency: ${tower.frequency || '-' } GHz</p>
                <p>Height: ${tower.height || '-'} m</p>
            </div>
        `;
    }

    updateTowerMarker(tower) {
        const m = this.towerMarkers.get(tower.id);
        if (!m) return;
        m.setLatLng([tower.lat, tower.lng]);
        m.setPopupContent(this._towerPopupHtml(tower));
    }

    removeTowerMarker(tower) {
        const m = this.towerMarkers.get(tower.id);
        if (m) {
            try { this.map.removeLayer(m); } catch (e) {}
            this.towerMarkers.delete(tower.id);
        }
    }

    highlightTower(tower, isSelected) {
        const marker = this.towerMarkers.get(tower.id);
        if (!marker) return;
        marker.setStyle(isSelected ? {
            color: '#f59e0b',
            fillColor: '#f59e0b',
            radius: 11,
            weight: 3
        } : {
            color: '#2563eb',
            fillColor: '#3b82f6',
            radius: 8,
            weight: 2
        });
        if (isSelected) marker.bringToFront();
    }

    /* ------------------ Links ------------------ */
    addLinkLine(link) {
        if (!link || !link.fromTower || !link.toTower) return;

        const from = [link.fromTower.lat, link.fromTower.lng];
        const to = [link.toTower.lat, link.toTower.lng];

        const valid = link.fromTower.frequency === link.toTower.frequency;
        const line = L.polyline([from, to], {
            color: valid ? '#10b981' : '#ef4444',
            weight: 4,
            dashArray: valid ? null : '6,6',
            smoothFactor: 1
        }).addTo(this.map);

        line.bringToFront();
        const distance = this.app.calculateDistance(link.fromTower, link.toTower);
        line.bindPopup(`
            <div class="link-popup">
                <h4>RF Link</h4>
                <p><strong>From:</strong> ${link.fromTower.name}</p>
                <p><strong>To:</strong> ${link.toTower.name}</p>
                <p><strong>Freq:</strong> ${link.frequency} GHz</p>
                <p><strong>Distance:</strong> ${distance.toFixed(2)} km</p>
            </div>
        `);

        line.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            if (this.app && typeof this.app.selectLink === 'function') this.app.selectLink(link);
        });

        const midLat = (from[0] + to[0]) / 2;
        const midLng = (from[1] + to[1]) / 2;
        const midMarker = L.circleMarker([midLat, midLng], {
            radius: 5,
            color: '#fff',
            fillColor: '#111827',
            fillOpacity: 0.9,
            weight: 1,
            interactive: false
        }).addTo(this.map);

        this.linkLines.set(link.id, { line, midMarker });

        // small create highlight
        line.setStyle({ weight: 6 });
        setTimeout(() => { if (line && line.setStyle) line.setStyle({ weight: 4 }); }, 300);
    }

    updateLinkLine(link) {
        const entry = this.linkLines.get(link.id);
        if (!entry) return;
        const { line, midMarker } = entry;
        const from = [link.fromTower.lat, link.fromTower.lng];
        const to = [link.toTower.lat, link.toTower.lng];
        line.setLatLngs([from, to]);
        if (midMarker) midMarker.setLatLng([(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]);

        const valid = link.fromTower.frequency === link.toTower.frequency;
        line.setStyle({ color: valid ? '#10b981' : '#ef4444', dashArray: valid ? null : '6,6' });
    }

    removeLinkLine(link) {
        const entry = this.linkLines.get(link.id);
        if (!entry) return;
        const { line, midMarker } = entry;
        try { if (line) this.map.removeLayer(line); } catch (e) {}
        try { if (midMarker) this.map.removeLayer(midMarker); } catch (e) {}
        this.linkLines.delete(link.id);
    }

    /* ------------------ TEMP LINK (smooth, interaction-lock) ------------------ */

    startTempLink(fromTower) {
        this.clearTempLink();

        this.tempLine = L.polyline([], {
            color: '#f59e0b',
            weight: 2,
            dashArray: '6,6',
            opacity: 0.95
        }).addTo(this.map);

        // store current interaction state so we can restore it later
        this._prevInteraction = {
            dragging: this.map.dragging && this.map.dragging.enabled ? this.map.dragging.enabled() : false,
            doubleClickZoom: this.map.doubleClickZoom && this.map.doubleClickZoom.enabled ? this.map.doubleClickZoom.enabled() : false,
            scrollWheelZoom: this.map.scrollWheelZoom && this.map.scrollWheelZoom.enabled ? this.map.scrollWheelZoom.enabled() : false,
            boxZoom: this.map.boxZoom && this.map.boxZoom.enabled ? this.map.boxZoom.enabled() : false,
            keyboard: this.map.keyboard && this.map.keyboard.enabled ? this.map.keyboard.enabled() : false,
            touchZoom: this.map.touchZoom && this.map.touchZoom.enabled ? this.map.touchZoom.enabled() : false,
            tap: this.map.tap && this.map.tap.enabled ? this.map.tap.enabled() : false
        };

        // disable all interactions that could interfere with clicking
        try { if (this.map.dragging && this.map.dragging.disable) this.map.dragging.disable(); } catch (e) {}
        try { if (this.map.doubleClickZoom && this.map.doubleClickZoom.disable) this.map.doubleClickZoom.disable(); } catch (e) {}
        try { if (this.map.scrollWheelZoom && this.map.scrollWheelZoom.disable) this.map.scrollWheelZoom.disable(); } catch (e) {}
        try { if (this.map.boxZoom && this.map.boxZoom.disable) this.map.boxZoom.disable(); } catch (e) {}
        try { if (this.map.keyboard && this.map.keyboard.disable) this.map.keyboard.disable(); } catch (e) {}
        try { if (this.map.touchZoom && this.map.touchZoom.disable) this.map.touchZoom.disable(); } catch (e) {}
        try { if (this.map.tap && this.map.tap.disable) this.map.tap.disable(); } catch (e) {}

        // bound mouse handler stores latlng and triggers RAF
        this._boundMouse = (e) => {
            this._lastMouseLatLng = e.latlng;
            if (!this._raf) this._raf = requestAnimationFrame(() => this._updateTempRAF());
        };
        this.map.on('mousemove', this._boundMouse);
    }

    _updateTempRAF() {
        this._raf = null;
        if (!this.tempLine || !this._lastMouseLatLng || !this.app.linkManager || !this.app.linkManager.tempLink) return;

        const from = [this.app.linkManager.tempLink.fromTower.lat, this.app.linkManager.tempLink.fromTower.lng];
        const to = [this._lastMouseLatLng.lat, this._lastMouseLatLng.lng];
        this.tempLine.setLatLngs([from, to]);
    }

    clearTempLink() {
        if (this.tempLine) {
            try { this.map.removeLayer(this.tempLine); } catch (e) {}
            this.tempLine = null;
        }

        if (this._boundMouse) {
            try { this.map.off('mousemove', this._boundMouse); } catch (e) {}
            this._boundMouse = null;
        }

        // restore previous interaction states exactly as they were
        if (this._prevInteraction) {
            try { if (this.map.dragging && this.map.dragging[this._prevInteraction.dragging ? 'enable' : 'disable']) this.map.dragging[this._prevInteraction.dragging ? 'enable' : 'disable'](); } catch (e) {}
            try { if (this.map.doubleClickZoom && this.map.doubleClickZoom[this._prevInteraction.doubleClickZoom ? 'enable' : 'disable']) this.map.doubleClickZoom[this._prevInteraction.doubleClickZoom ? 'enable' : 'disable'](); } catch (e) {}
            try { if (this.map.scrollWheelZoom && this.map.scrollWheelZoom[this._prevInteraction.scrollWheelZoom ? 'enable' : 'disable']) this.map.scrollWheelZoom[this._prevInteraction.scrollWheelZoom ? 'enable' : 'disable'](); } catch (e) {}
            try { if (this.map.boxZoom && this.map.boxZoom[this._prevInteraction.boxZoom ? 'enable' : 'disable']) this.map.boxZoom[this._prevInteraction.boxZoom ? 'enable' : 'disable'](); } catch (e) {}
            try { if (this.map.keyboard && this.map.keyboard[this._prevInteraction.keyboard ? 'enable' : 'disable']) this.map.keyboard[this._prevInteraction.keyboard ? 'enable' : 'disable'](); } catch (e) {}
            try { if (this.map.touchZoom && this.map.touchZoom[this._prevInteraction.touchZoom ? 'enable' : 'disable']) this.map.touchZoom[this._prevInteraction.touchZoom ? 'enable' : 'disable'](); } catch (e) {}
            try { if (this.map.tap && this.map.tap[this._prevInteraction.tap ? 'enable' : 'disable']) this.map.tap[this._prevInteraction.tap ? 'enable' : 'disable'](); } catch (e) {}
            this._prevInteraction = null;
        }

        if (this._raf) {
            cancelAnimationFrame(this._raf);
            this._raf = null;
        }

        this._lastMouseLatLng = null;
    }

    /* ------------------ Fresnel overlay helpers ------------------ */
    addFresnelOverlay(analysis) {
        if (!analysis || !this.map) return;
        if (this._fresnelLayer) this.clearFresnelOverlay();
        this._fresnelLayer = L.layerGroup().addTo(this.map);
        const mid = [analysis.midpoint.lat, analysis.midpoint.lng];
        L.circle(mid, {
            radius: analysis.maxRadius || 0,
            color: '#f59e0b',
            weight: 2,
            fillColor: '#f59e0b',
            fillOpacity: 0.12
        }).addTo(this._fresnelLayer);
    }

    clearFresnelOverlay() {
        if (!this._fresnelLayer) return;
        try { this.map.removeLayer(this._fresnelLayer); } catch (e) {}
        this._fresnelLayer = null;
    }

    /* ------------------ Utilities ------------------ */
    clearAll() {
        this.towerMarkers.forEach(m => { try { this.map.removeLayer(m); } catch (e) {} });
        this.linkLines.forEach(e => {
            try { if (e.line) this.map.removeLayer(e.line); } catch (er) {}
            try { if (e.midMarker) this.map.removeLayer(e.midMarker); } catch (er) {}
        });
        this.towerMarkers.clear();
        this.linkLines.clear();
        this.clearTempLink();
        this.clearFresnelOverlay();
    }

    updateCoordinates(latlng) {
        const el = document.getElementById('coordinates');
        if (el) el.textContent = `Lat: ${latlng.lat.toFixed(4)}, Lng: ${latlng.lng.toFixed(4)}`;
    }
}
