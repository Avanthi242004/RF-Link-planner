// js/towers.js
class TowerManager {
    constructor(app) {
        this.app = app;
        this.towers = [];
        this.selectedTower = null;
    }

    createTower(lat, lng, name = null, frequency = 5.0, height = 30) {
        const tower = {
            id: `tower_${Date.now()}`,
            lat,
            lng,
            name: name || `Tower ${this.towers.length + 1}`,
            frequency: (frequency !== undefined && frequency !== null) ? parseFloat(frequency) : NaN,
            height: (height !== undefined && height !== null) ? parseInt(height) : 30,
            createdAt: new Date()
        };

        this.towers.push(tower);

        if (this.app.mapManager && typeof this.app.mapManager.addTowerMarker === 'function') {
            this.app.mapManager.addTowerMarker(tower);
        }

        // Auto-select the newly created tower so user can set freq/height immediately
        this.selectTower(tower);

        this.app.updateUI();
        return tower;
    }

    selectTower(tower) {
        if (!tower) return;
        if (this.selectedTower && this.selectedTower.id === tower.id) return;

        if (this.selectedTower) this.deselectTower();

        this.selectedTower = tower;
        if (this.app.mapManager && typeof this.app.mapManager.highlightTower === 'function') {
            this.app.mapManager.highlightTower(tower, true);
        }

        this.populateTowerForm(tower);
        this.app.updateUI();

        const towerConfig = document.getElementById('tower-config');
        const noTower = document.getElementById('no-tower-selected');
        if (towerConfig) towerConfig.classList.remove('hidden');
        if (noTower) noTower.classList.add('hidden');
        // Show tower form block if present
        const tf = document.getElementById('tower-form');
        if (tf) tf.classList.remove('hidden');
    }

    deselectTower() {
        if (!this.selectedTower) return;
        if (this.app.mapManager && typeof this.app.mapManager.highlightTower === 'function') {
            this.app.mapManager.highlightTower(this.selectedTower, false);
        }
        this.selectedTower = null;
        this.app.updateUI();

        const tf = document.getElementById('tower-form');
        if (tf) tf.classList.add('hidden');
        const nt = document.getElementById('no-tower-selected');
        if (nt) nt.classList.remove('hidden');
    }

    populateTowerForm(tower) {
        const nameEl = document.getElementById('tower-name');
        const freqEl = document.getElementById('tower-frequency');
        const heightEl = document.getElementById('tower-height');

        if (nameEl) nameEl.value = tower.name || '';
        if (freqEl) freqEl.value = (typeof tower.frequency === 'number' && !isNaN(tower.frequency)) ? tower.frequency : '';
        if (heightEl) heightEl.value = tower.height || '';
    }

    updateTower(towerId, updates) {
        const idx = this.towers.findIndex(t => t.id === towerId);
        if (idx === -1) return null;
        const tower = this.towers[idx];

        if (updates.frequency !== undefined) updates.frequency = (updates.frequency === '' || updates.frequency === null) ? NaN : parseFloat(updates.frequency);
        if (updates.height !== undefined) updates.height = (updates.height === '' || updates.height === null) ? tower.height : parseInt(updates.height);

        Object.assign(tower, updates);

        if (this.app.mapManager && typeof this.app.mapManager.updateTowerMarker === 'function') {
            this.app.mapManager.updateTowerMarker(tower);
        }

        if (updates.frequency !== undefined && this.app.linkManager && typeof this.app.linkManager.updateLinksForTower === 'function') {
            this.app.linkManager.updateLinksForTower(tower);
        }

        this.app.updateUI();
        return tower;
    }

    deleteTower(towerId) {
        const idx = this.towers.findIndex(t => t.id === towerId);
        if (idx === -1) return false;

        const tower = this.towers[idx];

        if (this.app.linkManager && typeof this.app.linkManager.removeLinksForTower === 'function') {
            this.app.linkManager.removeLinksForTower(tower);
        }

        this.towers.splice(idx, 1);

        if (this.app.mapManager && typeof this.app.mapManager.removeTowerMarker === 'function') {
            this.app.mapManager.removeTowerMarker(tower);
        }

        if (this.selectedTower && this.selectedTower.id === towerId) this.deselectTower();

        this.app.updateUI();
        return true;
    }

    getTowerById(id) {
        return this.towers.find(t => t.id === id);
    }

    exportTowers() {
        return JSON.parse(JSON.stringify(this.towers));
    }

    importTowers(towerData) {
        this.towers.forEach(t => {
            if (this.app.mapManager && typeof this.app.mapManager.removeTowerMarker === 'function') {
                this.app.mapManager.removeTowerMarker(t);
            }
        });
        this.towers = [];

        towerData.forEach(td => {
            this.createTower(td.lat, td.lng, td.name, td.frequency, td.height);
        });

        this.app.updateUI();
    }

    clearAllTowers() {
        this.towers.forEach(t => {
            if (this.app.mapManager && typeof this.app.mapManager.removeTowerMarker === 'function') {
                this.app.mapManager.removeTowerMarker(t);
            }
        });
        this.towers = [];
        this.selectedTower = null;
        this.app.updateUI();
    }

    /**
     * validateTowerConnection
     */
    validateTowerConnection(tower1, tower2) {
        if (!tower1 || !tower2) return { valid: false, reason: 'Invalid towers' };
        if (tower1.id === tower2.id) return { valid: false, reason: 'Cannot connect tower to itself' };

        if (typeof tower1.frequency !== 'number' || isNaN(tower1.frequency)) {
            return { valid: false, reason: `Please set a valid frequency for ${tower1.name}` };
        }
        if (typeof tower2.frequency !== 'number' || isNaN(tower2.frequency)) {
            return { valid: false, reason: `Please set a valid frequency for ${tower2.name}` };
        }

        if (tower1.frequency !== tower2.frequency) {
            return { valid: false, reason: `Frequency mismatch: ${tower1.frequency} GHz vs ${tower2.frequency} GHz` };
        }

        if (this.app.linkManager && typeof this.app.linkManager.findLink === 'function') {
            const existing = this.app.linkManager.findLink(tower1, tower2);
            if (existing) return { valid: false, reason: 'Link already exists between these towers' };
        }

        return { valid: true };
    }
}
