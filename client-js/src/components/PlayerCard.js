import { calculateTierFromPoints, getPieceGlyph } from "../services/chessRulesHelper.js";
import { TierBadge } from "./TierBadge.js";

// Orden de visualización de las piezas capturadas (de mayor a menor valor)
const CAPTURE_ORDER = ["PIECEQUEEN", "PIECEROOK", "PIECEBISHOP", "PIECEKNIGHT", "PIECEPAWN", "PIECEKING"];

export class PlayerCard {
    constructor(title, defaultNickname, colorClass) {
        this.title = title;
        this.defaultNickname = defaultNickname;
        this.colorClass = colorClass;

        this.element = document.createElement("div");
        this.element.className = `player-card player-${colorClass}`;

        this.nameEl = document.createElement("div");
        this.nameEl.className = "player-name";

        this.ptsEl = document.createElement("div");
        this.ptsEl.className = "player-pts";

        this.tierBadge = new TierBadge(calculateTierFromPoints(1200));

        this.capturesEl = document.createElement("div");
        this.capturesEl.className = "captured-pieces";

        this.build();
    }

    build() {
        const header = document.createElement("div");
        header.className = "player-card-header";
        header.textContent = this.title;

        const infoGroup = document.createElement("div");
        infoGroup.className = "player-info-group";

        this.nameEl.textContent = this.defaultNickname;
        this.ptsEl.textContent = "1200 pts";

        infoGroup.appendChild(this.nameEl);
        infoGroup.appendChild(this.tierBadge.getElement());

        this.element.appendChild(header);
        this.element.appendChild(infoGroup);
        this.element.appendChild(this.ptsEl);
        this.element.appendChild(this.capturesEl);
    }

    update(nickname, points = 1200, capturedPieces = []) {
        // RF-PC-01: Nombre y puntuación
        const pts = (points === undefined || points === null) ? 1200 : points;
        this.nameEl.textContent = nickname || this.defaultNickname;
        this.ptsEl.textContent = `${pts} pts`;

        // RF-PC-02: Insignia de tier
        this.tierBadge.update(calculateTierFromPoints(pts));

        // RF-PC-02: Piezas capturadas (glifos ordenados y separados por espacio)
        if (capturedPieces && capturedPieces.length > 0) {
            const sorted = [...capturedPieces].sort((a, b) =>
                CAPTURE_ORDER.indexOf(this.typeName(a)) - CAPTURE_ORDER.indexOf(this.typeName(b)));
            this.capturesEl.textContent = sorted.map(p => getPieceGlyph(p)).filter(g => g).join(" ");
        } else {
            this.capturesEl.replaceChildren();
        }
    }

    typeName(piece) {
        return piece && piece.type ? (piece.type._name || piece.type.name || "") : "";
    }

    getElement() {
        return this.element;
    }
}
