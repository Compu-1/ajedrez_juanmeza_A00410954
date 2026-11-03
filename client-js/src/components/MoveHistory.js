/**
 * Componente: Historial de Jugadas (MoveHistory)
 *
 * RF-MH-01: Estructura (moves-card, encabezado "Historial de Jugadas", lista moves-list) y estado vacío.
 * RF-MH-02: Agrupa las jugadas de dos en dos por turno: "<strong>1. </strong>e4 e5".
 * RF-MH-03: Auto-scroll para mantener visible la última jugada.
 */
export class MoveHistory {
    constructor() {
        this.element = document.createElement("div");
        this.listContainer = document.createElement("div");
        this.build();
    }

    build() {
        this.element.className = "moves-card";

        const header = document.createElement("div");
        header.className = "player-card-header";
        header.textContent = "Historial de Jugadas";

        this.listContainer.id = "moves-list";
        this.listContainer.className = "moves-list";

        this.element.appendChild(header);
        this.element.appendChild(this.listContainer);

        this.renderEmpty();
    }

    renderEmpty() {
        this.listContainer.replaceChildren();
        const empty = document.createElement("em");
        empty.textContent = "Sin jugadas aún";
        this.listContainer.appendChild(empty);
    }

    update(moves) {
        if (!moves || moves.length === 0) {
            this.renderEmpty();
            return;
        }

        this.listContainer.replaceChildren();

        for (let i = 0; i < moves.length; i += 2) {
            const turnNumber = i / 2 + 1;
            const whiteMove = this.getNotation(moves[i]);
            const blackMove = i + 1 < moves.length ? this.getNotation(moves[i + 1]) : "";

            const row = document.createElement("div");

            const turnLabel = document.createElement("strong");
            turnLabel.textContent = `${turnNumber}. `;

            row.appendChild(turnLabel);
            row.appendChild(document.createTextNode(blackMove ? `${whiteMove} ${blackMove}` : whiteMove));

            this.listContainer.appendChild(row);
        }

        // RF-MH-03: Auto-scroll a la jugada más reciente
        this.listContainer.scrollTop = this.listContainer.scrollHeight;
    }

    getNotation(move) {
        if (!move) return "";
        return move.moveNotation !== undefined ? move.moveNotation : (move._moveNotation || "");
    }

    getElement() {
        return this.element;
    }
}
