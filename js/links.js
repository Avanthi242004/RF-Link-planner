// js/links.js
class LinkManager {
    constructor(app) {
        this.app = app;
        this.links = [];
        this.selectedLink = null;
        this.tempLink = null; // { fromTower }
    }

    createLink(fromTower, toTower) {
        const validation = (this.app && this.app.towerManager && typeof this.app.towerManager.validateTowerConnection === 'function')
            ? this.app.towerManager.validateTowerConnection(fromTower, toTower)
            : { valid: true };

        if (!validation.valid) throw new Error(validation.reason);

        const newLink = {
            id: `link_${Date.now()}`,
            fromTower,
            toTower,
            frequency: fromTower.frequency,
            distance: this.app.calculateDistance(fromTower, toTower),
            createdAt: new Date()
        };

        this.links.push(newLink);

        if (this.app.mapManager && typeof this.app.mapManager.addLinkLine === 'function') {
            this.app.mapManager.addLinkLine(newLink);
        }

        this.app.updateUI();
        this.selectLink(newLink);

        return newLink;
    }

    startTempLink(fromTower) {
        if (!fromTower || typeof fromTower.frequency !== 'number' || isNaN(fromTower.frequency)) {
            alert(`Please set a valid frequency for ${fromTower ? fromTower.name : 'the tower'} before creating a link.`);
            if (fromTower) this.app.selectTower(fromTower);
            return;
        }

        this.tempLink = { fromTower };
        if (this.app.mapManager && typeof this.app.mapManager.startTempLink === 'function') {
            this.app.mapManager.startTempLink(fromTower);
        }
    }

    completeTempLink(toTower) {
        if (!this.tempLink || !this.tempLink.fromTower) throw new Error('No temp link active');

        const fromTower = this.tempLink.fromTower;

        if (!toTower || typeof toTower.frequency !== 'number' || isNaN(toTower.frequency)) {
            alert(`Please set a valid frequency for ${toTower ? toTower.name : 'the tower'} before creating a link.`);
            if (toTower) this.app.selectTower(toTower);
            return;
        }

        if (fromTower.id === toTower.id) {
            alert('Cannot connect tower to itself.');
            return;
        }

        try {
            const link = this.createLink(fromTower, toTower);
            this.cancelTempLink();
            return link;
        } catch (err) {
            alert(err.message || 'Failed to create link');
            throw err;
        }
    }

    cancelTempLink() {
        this.tempLink = null;
        if (this.app.mapManager && typeof this.app.mapManager.clearTempLink === 'function') {
            this.app.mapManager.clearTempLink();
        }
    }

    selectLink(link) {
        if (!link) return;
        if (this.selectedLink && this.selectedLink.id === link.id) return;
        if (this.selectedLink) this.deselectLink();

        this.selectedLink = link;
        if (this.app.mapManager && typeof this.app.mapManager.highlightLink === 'function') {
            this.app.mapManager.highlightLink(link, true);
        }

        this.populateLinkInfo(link);
        this.app.updateUI();

        const mapEntry = this.app.mapManager && this.app.mapManager.linkLines ? this.app.mapManager.linkLines.get(link.id) : null;
        if (mapEntry && mapEntry.line && typeof mapEntry.line.openPopup === 'function') {
            mapEntry.line.openPopup();
            mapEntry.line.bringToFront();
        }
    }

    deselectLink() {
        if (!this.selectedLink) return;
        if (this.app.mapManager && typeof this.app.mapManager.highlightLink === 'function') {
            this.app.mapManager.highlightLink(this.selectedLink, false);
        }
        this.selectedLink = null;
        this.clearLinkInfo();
        this.app.updateUI();
    }

    populateLinkInfo(link) {
        if (!link) return;
        const distance = this.app.calculateDistance(link.fromTower, link.toTower);
        const linkDistanceEl = document.getElementById('link-distance');
        const linkFreqEl = document.getElementById('link-frequency');
        const linkStatusEl = document.getElementById('link-status');

        if (linkDistanceEl) linkDistanceEl.textContent = `${distance.toFixed(2)} km`;
        if (linkFreqEl) linkFreqEl.textContent = `${link.frequency} GHz`;

        const status = link.fromTower.frequency === link.toTower.frequency ? 'Connected' : 'Frequency Mismatch';
        if (linkStatusEl) {
            linkStatusEl.textContent = status;
            linkStatusEl.style.color = (status === 'Connected') ? 'var(--success-color)' : 'var(--danger-color)';
        }
    }

    clearLinkInfo() {
        const linkDistanceEl = document.getElementById('link-distance');
        const linkFreqEl = document.getElementById('link-frequency');
        const linkStatusEl = document.getElementById('link-status');

        if (linkDistanceEl) linkDistanceEl.textContent = '-';
        if (linkFreqEl) linkFreqEl.textContent = '-';
        if (linkStatusEl) {
            linkStatusEl.textContent = '-';
            linkStatusEl.style.color = '';
        }
    }

    deleteLink(linkId) {
        const idx = this.links.findIndex(l => l.id === linkId);
        if (idx === -1) return false;
        const [link] = this.links.splice(idx, 1);

        if (this.app.mapManager && typeof this.app.mapManager.removeLinkLine === 'function') {
            this.app.mapManager.removeLinkLine(link);
        }

        if (this.selectedLink && this.selectedLink.id === linkId) {
            this.deselectLink();
        }

        this.app.updateUI();
        return true;
    }

    findLink(tower1, tower2) {
        return this.links.find(l =>
            (l.fromTower.id === tower1.id && l.toTower.id === tower2.id) ||
            (l.fromTower.id === tower2.id && l.toTower.id === tower1.id)
        );
    }

    getLinksForTower(tower) {
        return this.links.filter(l => l.fromTower.id === tower.id || l.toTower.id === tower.id);
    }

    removeLinksForTower(tower) {
        const toRemove = this.getLinksForTower(tower);
        toRemove.forEach(l => this.deleteLink(l.id));
    }

    updateLinksForTower(tower) {
        const affected = this.getLinksForTower(tower);
        affected.forEach(link => {
            if (link.fromTower.id === tower.id) link.frequency = tower.frequency;
            if (link.toTower.id === tower.id) link.frequency = tower.frequency;

            link.distance = this.app.calculateDistance(link.fromTower, link.toTower);

            if (this.app.mapManager && typeof this.app.mapManager.updateLinkLine === 'function') {
                this.app.mapManager.updateLinkLine(link);
            }
        });

        if (this.selectedLink && affected.find(l => l.id === this.selectedLink.id)) {
            this.populateLinkInfo(this.selectedLink);
        }

        this.app.updateUI();
    }

    exportLinks() {
        return this.links.map(l => ({
            id: l.id,
            fromTowerId: l.fromTower.id,
            toTowerId: l.toTower.id,
            frequency: l.frequency
        }));
    }

    importLinks(linkData, towers) {
        this.links.forEach(l => {
            if (this.app.mapManager && typeof this.app.mapManager.removeLinkLine === 'function') {
                this.app.mapManager.removeLinkLine(l);
            }
        });
        this.links = [];

        linkData.forEach(ld => {
            const from = towers.find(t => t.id === ld.fromTowerId);
            const to = towers.find(t => t.id === ld.toTowerId);
            if (from && to) {
                try { this.createLink(from, to); } catch (e) { console.warn('failed to import link', e.message); }
            }
        });

        this.app.updateUI();
    }

    clearAllLinks() {
        this.links.forEach(l => {
            if (this.app.mapManager && typeof this.app.mapManager.removeLinkLine === 'function') {
                this.app.mapManager.removeLinkLine(l);
            }
        });
        this.links = [];
        this.selectedLink = null;
        this.app.updateUI();
    }
}
