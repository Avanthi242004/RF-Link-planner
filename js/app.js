// js/app.js
class RFLinkPlanner {
    constructor() {
        this.currentMode = 'navigation';

        // create managers in right order (mapManager expected to be defined in map.js)
        this.mapManager = new MapManager('map', this);
        this.towerManager = new TowerManager(this);
        this.linkManager = new LinkManager(this);
        this.fresnelCalculator = new FresnelCalculator();

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupExportImport();
        this.updateUI();
    }

    setupEventListeners() {
        const byId = (id) => document.getElementById(id);

        const addTowerBtn = byId('add-tower-btn');
        const addLinkBtn = byId('add-link-btn');
        const clearAllBtn = byId('clear-all-btn');
        const saveTowerBtn = byId('save-tower-btn');
        const deleteTowerBtn = byId('delete-tower-btn');
        const showFresnelBtn = byId('show-fresnel-btn');
        const deleteLinkBtn = byId('delete-link-btn');
        const closeModal = byId('close-modal');
        const zoomIn = byId('zoom-in');
        const zoomOut = byId('zoom-out');

        const helpBtn = byId('help-btn');                // NEW: help button
        const helpModal = byId('help-modal');            // NEW: help modal
        const helpClose = byId('help-close');            // NEW: help modal close
        const helpDone = byId('help-done');              // NEW: help done button

        if (addTowerBtn) addTowerBtn.addEventListener('click', () => this.setMode('add-tower'));
        if (addLinkBtn) addLinkBtn.addEventListener('click', () => this.setMode('add-link'));
        if (clearAllBtn) clearAllBtn.addEventListener('click', () => this.clearAll());

        if (saveTowerBtn) saveTowerBtn.addEventListener('click', () => this.saveTowerConfig());
        if (deleteTowerBtn) deleteTowerBtn.addEventListener('click', () => this.deleteSelectedTower());

        if (showFresnelBtn) showFresnelBtn.addEventListener('click', () => this.showFresnelZone());
        if (deleteLinkBtn) deleteLinkBtn.addEventListener('click', () => this.deleteSelectedLink());

        if (closeModal) closeModal.addEventListener('click', () => this.hideFresnelModal());

        // Help modal wiring
        if (helpBtn) helpBtn.addEventListener('click', () => this.showHelpModal());
        if (helpClose) helpClose.addEventListener('click', () => this.hideHelpModal());
        if (helpDone) helpDone.addEventListener('click', () => this.hideHelpModal());
        if (helpModal) {
            helpModal.addEventListener('click', (ev) => {
                if (ev.target === helpModal) this.hideHelpModal();
            });
        }

        document.addEventListener('keydown', (e) => {
            // Esc closes modals and cancels modes
            if (e.key === 'Escape') {
                this.setMode('navigation');
                this.cancelLinkCreation();
                this.hideHelpModal();
                this.hideFresnelModal();
            }
            // Delete removes selected
            if (e.key === 'Delete') {
                if (this.towerManager.selectedTower) this.deleteSelectedTower();
                else if (this.linkManager.selectedLink) this.deleteSelectedLink();
            }
        });

        if (zoomIn && this.mapManager && this.mapManager.map) zoomIn.addEventListener('click', () => this.mapManager.map.zoomIn());
        if (zoomOut && this.mapManager && this.mapManager.map) zoomOut.addEventListener('click', () => this.mapManager.map.zoomOut());

        const modal = byId('fresnel-modal');
        if (modal) {
            modal.addEventListener('click', (ev) => {
                if (ev.target === modal) this.hideFresnelModal();
            });
        }
    }

    setupExportImport() {
        const exportBtn = document.getElementById('export-btn');
        if (exportBtn) exportBtn.addEventListener('click', () => this.exportProject());

        const importInput = document.createElement('input');
        importInput.type = 'file';
        importInput.accept = '.json';
        importInput.style.display = 'none';
        importInput.addEventListener('change', (e) => this.importProject(e));
        document.body.appendChild(importInput);

        const userActions = document.querySelector('.user-actions');
        if (userActions) {
            const importBtn = document.createElement('button');
            importBtn.className = 'btn-secondary';
            importBtn.innerHTML = '<span class="btn-icon">📥</span>Import Project';
            importBtn.addEventListener('click', () => importInput.click());
            userActions.appendChild(importBtn);
        }
    }

    /* ---------------- Mode and tower/link management ---------------- */
    setMode(mode) {
        this.currentMode = mode;
        if (mode !== 'add-link' && this.linkManager) this.linkManager.cancelTempLink();

        this.updateUI();

        if (this.mapManager) {
            if (mode === 'add-tower' && typeof this.mapManager.enableTowerPlacement === 'function') this.mapManager.enableTowerPlacement();
            else if (mode === 'add-link' && typeof this.mapManager.enableLinkCreation === 'function') this.mapManager.enableLinkCreation();
            else if (typeof this.mapManager.disableSpecialModes === 'function') this.mapManager.disableSpecialModes();
        }
    }

    addTower(lat, lng) {
        return this.towerManager.createTower(lat, lng);
    }

    selectTower(tower) {
        this.towerManager.selectTower(tower);
    }

    saveTowerConfig() {
        const tower = this.towerManager.selectedTower;
        if (!tower) return;

        const nameEl = document.getElementById('tower-name');
        const freqEl = document.getElementById('tower-frequency');
        const heightEl = document.getElementById('tower-height');

        const updates = {
            name: nameEl ? nameEl.value : tower.name,
            frequency: freqEl ? parseFloat(freqEl.value) : tower.frequency,
            height: heightEl ? parseInt(heightEl.value) : tower.height
        };

        this.towerManager.updateTower(tower.id, updates);
    }

    deleteSelectedTower() {
        const tower = this.towerManager.selectedTower;
        if (!tower) return;
        if (confirm(`Are you sure you want to delete ${tower.name}?`)) {
            this.towerManager.deleteTower(tower.id);
        }
    }

    startLinkCreation(fromTower) {
        this.linkManager.startTempLink(fromTower);
    }

    completeLinkCreation(toTower) {
        try {
            this.linkManager.completeTempLink(toTower);
        } catch (error) {
            alert(error.message);
        }
    }

    cancelLinkCreation() {
        this.linkManager.cancelTempLink();
    }

    selectLink(link) {
        this.linkManager.selectLink(link);
    }

    deleteSelectedLink() {
        const link = this.linkManager.selectedLink;
        if (!link) return;
        if (confirm('Delete this link?')) this.linkManager.deleteLink(link.id);
    }

    /* ---------------- Fresnel handling (unchanged) ---------------- */
    showFresnelZone() {
        const link = this.linkManager.selectedLink;
        if (!link) {
            alert('Select a link first to analyze Fresnel zone.');
            return;
        }

        let analysis;
        try {
            analysis = this.fresnelCalculator.analyzeLink(link);
        } catch (err) {
            alert('Fresnel analysis failed: ' + (err && err.message ? err.message : err));
            return;
        }

        this.displayFresnelModal(analysis);

        if (this.mapManager && typeof this.mapManager.addFresnelOverlay === 'function') {
            try {
                this.mapManager.clearFresnelOverlay();
                this.mapManager.addFresnelOverlay(analysis);
            } catch (err) {
                console.warn('mapManager.addFresnelOverlay failed:', err);
            }
        }
    }

    displayFresnelModal(analysis) {
        const freqEl = document.getElementById('fresnel-frequency');
        const wavelengthEl = document.getElementById('fresnel-wavelength');
        const distanceEl = document.getElementById('fresnel-distance');
        const maxRadiusEl = document.getElementById('fresnel-max-radius');

        if (freqEl) freqEl.textContent = `${Number(analysis.frequency).toFixed(3)} GHz`;
        if (wavelengthEl) wavelengthEl.textContent = `${Number(analysis.wavelength).toFixed(4)} m`;

        let distKm = null;
        if (analysis.distance !== undefined) {
            if (analysis.distance > 1000) distKm = analysis.distance / 1000;
            else distKm = analysis.distance;
        } else if (analysis.distanceKm !== undefined) {
            distKm = analysis.distanceKm;
        } else {
            distKm = this.calculateDistance(this.linkManager.selectedLink.fromTower, this.linkManager.selectedLink.toTower);
        }
        if (distanceEl) distanceEl.textContent = `${Number(distKm).toFixed(3)} km`;
        if (maxRadiusEl) maxRadiusEl.textContent = `${Number(analysis.maxRadius).toFixed(2)} m`;

        try {
            if (typeof this.drawFresnelVisualization === 'function') {
                this.drawFresnelVisualization(analysis);
            }
        } catch (err) {
            console.warn('drawFresnelVisualization failed:', err);
        }

        const modal = document.getElementById('fresnel-modal');
        if (modal) modal.classList.remove('hidden');

        const closeBtn = document.getElementById('close-modal');
        if (closeBtn) {
            closeBtn.onclick = () => {
                this.hideFresnelModal();
                if (this.mapManager && typeof this.mapManager.clearFresnelOverlay === 'function') {
                    try { this.mapManager.clearFresnelOverlay(); } catch (e) { console.warn(e); }
                }
            };
        }
    }

    hideFresnelModal() {
        const modal = document.getElementById('fresnel-modal');
        if (modal) modal.classList.add('hidden');

        const canvas = document.getElementById('fresnel-canvas');
        if (canvas && canvas.getContext) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }

        if (this.mapManager && typeof this.mapManager.clearFresnelOverlay === 'function') {
            try { this.mapManager.clearFresnelOverlay(); } catch (err) { console.warn(err); }
        }
    }

    /* ---------------- HELP MODAL (NEW) ---------------- */
    showHelpModal() {
        const helpModal = document.getElementById('help-modal');
        if (helpModal) helpModal.classList.remove('hidden');
    }

    hideHelpModal() {
        const helpModal = document.getElementById('help-modal');
        if (helpModal) helpModal.classList.add('hidden');
    }

    /* ---------------- Visualization helper (unchanged) ---------------- */
    drawFresnelVisualization(analysis) {
        const canvas = document.getElementById('fresnel-canvas');
        if (!canvas || !canvas.getContext) return;
        const ctx = canvas.getContext('2d');

        const dpr = window.devicePixelRatio || 1;
        const displayWidth = canvas.width;
        const displayHeight = canvas.height;
        canvas.width = Math.round(displayWidth * dpr);
        canvas.height = Math.round(displayHeight * dpr);
        canvas.style.width = `${displayWidth}px`;
        canvas.style.height = `${displayHeight}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        ctx.clearRect(0, 0, displayWidth, displayHeight);

        const centerX = displayWidth / 2;
        const centerY = displayHeight / 2;

        const distMeters = (analysis.distance && analysis.distance > 1000) ? analysis.distance : (analysis.distanceKm ? analysis.distanceKm * 1000 : (this.linkManager.selectedLink ? this.calculateDistance(this.linkManager.selectedLink.fromTower, this.linkManager.selectedLink.toTower) * 1000 : 1000));
        const maxRadius = Math.max(analysis.maxRadius || 1, 1);

        const maxVisualRadius = Math.min(displayWidth, displayHeight) * 0.28;
        const scale = maxRadius > 0 ? maxVisualRadius / maxRadius : 1;
        const halfLine = Math.min(displayWidth * 0.42, distMeters * 0.0005 * displayWidth);

        ctx.beginPath();
        ctx.moveTo(centerX - halfLine, centerY);
        ctx.lineTo(centerX + halfLine, centerY);
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#2563eb';
        ctx.stroke();

        ctx.beginPath();
        ctx.ellipse(centerX, centerY, halfLine, maxRadius * scale, 0, 0, Math.PI * 2);
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#2563eb';
        ctx.beginPath();
        ctx.arc(centerX - halfLine, centerY, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(centerX + halfLine, centerY, 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Tower A', centerX - halfLine, centerY + 26);
        ctx.fillText('Tower B', centerX + halfLine, centerY + 26);

        ctx.font = '12px Arial';
        ctx.fillText(`Max Fresnel Radius: ${maxRadius.toFixed(2)} m`, centerX, centerY - (maxRadius * scale) - 20);

        if (Array.isArray(analysis.points) && analysis.points.length > 1) {
            const pts = analysis.points;
            for (let i = 0; i < pts.length; i++) {
                const f = i / (pts.length - 1);
                const x = centerX - halfLine + (2 * halfLine) * f;
                const r = (pts[i].radius || 0) * scale;
                ctx.beginPath();
                ctx.moveTo(x, centerY - r);
                ctx.lineTo(x, centerY + r);
                ctx.lineWidth = 1;
                ctx.strokeStyle = 'rgba(245,158,11,0.35)';
                ctx.stroke();
            }
        }
    }

    /* ---------------- Utility functions ---------------- */
    calculateDistance(tower1, tower2) {
        const R = 6371; // km
        const dLat = this.deg2rad(tower2.lat - tower1.lat);
        const dLng = this.deg2rad(tower2.lng - tower1.lng);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.deg2rad(tower1.lat)) * Math.cos(this.deg2rad(tower2.lat)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    deg2rad(deg) { return deg * (Math.PI / 180); }

    exportProject() {
        const project = {
            version: '1.0',
            towers: this.towerManager.exportTowers(),
            links: this.linkManager.exportLinks()
        };
        const dataStr = JSON.stringify(project, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `rf-link-plan-${new Date().toISOString().slice(0,10)}.json`;
        a.click();
    }

    importProject(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const project = JSON.parse(e.target.result);
                if (confirm('Import will replace current project. Continue?')) {
                    this.towerManager.importTowers(project.towers || []);
                    this.linkManager.importLinks(project.links || [], this.towerManager.towers);
                    alert('Imported');
                }
            } catch (err) {
                alert('Import error: ' + err.message);
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    }

    clearAll() {
        if (!confirm('Clear all towers and links?')) return;
        this.towerManager.clearAllTowers();
        this.linkManager.clearAllLinks();
        if (this.mapManager && typeof this.mapManager.clearAll === 'function') this.mapManager.clearAll();
        this.setMode('navigation');
    }

    updateUI() {
        const modes = { navigation: 'Navigation', 'add-tower': 'Add Tower Mode', 'add-link': 'Add Link Mode' };
        const modeEl = document.getElementById('current-mode');
        if (modeEl) modeEl.textContent = `Current Mode: ${modes[this.currentMode] || this.currentMode}`;

        const towerConfig = document.getElementById('tower-config');
        const noTower = document.getElementById('no-tower-selected');
        if (this.towerManager.selectedTower) {
            if (towerConfig) towerConfig.classList.remove('hidden');
            if (noTower) noTower.classList.add('hidden');
        } else {
            if (towerConfig) towerConfig.classList.add('hidden');
            if (noTower) noTower.classList.remove('hidden');
        }

        const linkInfo = document.getElementById('link-info');
        const noLink = document.getElementById('no-link-selected');

        let linkList = document.getElementById('link-list');
        if (!linkList) {
            linkList = document.createElement('div');
            linkList.id = 'link-list';
            linkList.style.marginTop = '12px';
            linkList.style.maxHeight = '200px';
            linkList.style.overflowY = 'auto';
            const parent = document.getElementById('link-info') || document.querySelector('.sidebar-section:nth-of-type(3)');
            if (parent) parent.appendChild(linkList);
        }

        linkList.innerHTML = '';
        this.linkManager.links.forEach(link => {
            const row = document.createElement('div');
            row.className = 'link-row';
            row.style.display = 'flex';
            row.style.justifyContent = 'space-between';
            row.style.alignItems = 'center';
            row.style.padding = '6px';
            row.style.borderRadius = '6px';
            row.style.marginBottom = '6px';
            row.style.cursor = 'pointer';
            row.style.background = (this.linkManager.selectedLink && this.linkManager.selectedLink.id === link.id) ? 'rgba(37,99,235,0.08)' : 'transparent';

            const title = document.createElement('div');
            title.textContent = `${link.fromTower.name} ↔ ${link.toTower.name}`;
            title.style.fontSize = '13px';
            title.style.color = '#0f172a';

            const actions = document.createElement('div');

            const q = document.createElement('span');
            q.textContent = `${link.distance.toFixed(2)} km`;
            q.style.fontSize = '12px';
            q.style.marginRight = '8px';
            q.style.color = '#475569';

            const btn = document.createElement('button');
            btn.className = 'btn-secondary';
            btn.textContent = 'Select';
            btn.style.fontSize = '12px';
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectLink(link);
            });

            actions.appendChild(q);
            actions.appendChild(btn);
            row.appendChild(title);
            row.appendChild(actions);

            row.addEventListener('click', () => this.selectLink(link));

            linkList.appendChild(row);
        });

        if (this.linkManager.selectedLink) {
            if (linkInfo) linkInfo.classList.remove('hidden');
            if (noLink) noLink.classList.add('hidden');
        } else {
            if (linkInfo) linkInfo.classList.add('hidden');
            if (noLink) noLink.classList.remove('hidden');
        }

        const addTowerBtn = document.getElementById('add-tower-btn');
        const addLinkBtn = document.getElementById('add-link-btn');
        if (addTowerBtn) addTowerBtn.classList.toggle('active', this.currentMode === 'add-tower');
        if (addLinkBtn) addLinkBtn.classList.toggle('active', this.currentMode === 'add-link');
    }

    handleKeyboardShortcuts(e) {
        if (e.key === 'Escape') {
            this.setMode('navigation');
            this.cancelLinkCreation();
        }
        if (e.key === 'Delete') {
            if (this.towerManager.selectedTower) this.deleteSelectedTower();
            else if (this.linkManager.selectedLink) this.deleteSelectedLink();
        }
    }
}

// init
document.addEventListener('DOMContentLoaded', () => {
    window.rfApp = new RFLinkPlanner();
});
