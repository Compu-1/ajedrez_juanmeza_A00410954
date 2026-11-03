import { getPieceGlyph } from "../services/chessRulesHelper.js";

/**
 * Componente Tablero de Ajedrez 8x8 (RF-CB-01 a RF-CB-04).
 */
export class ChessBoard {
    constructor(onSquareClick) {
        this.onSquareClick = onSquareClick;

        this.wrapper = document.createElement("div");
        this.wrapper.className = "board-wrapper";

        this.element = document.createElement("div");
        this.element.id = "chess-board";
        this.element.className = "chessboard";

        this.wrapper.appendChild(this.element);
    }

    render(gameState, selectedSquare = null, legalMoves = []) {
        // RF-CB-01: Validación
        if (!gameState) return;
        const board = gameState.board !== undefined ? gameState.board : gameState._board;
        if (!board) return;

        this.element.replaceChildren();

        // RF-CB-02: Última jugada (origen y destino)
        const moves = gameState.moves || gameState._moves || [];
        const lastMove = moves.length > 0 ? moves[moves.length - 1] : null;
        const lastFrom = lastMove ? (lastMove.fromPos || lastMove._fromPos) : null;
        const lastTo = lastMove ? (lastMove.toPos || lastMove._toPos) : null;

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const tile = document.createElement("div");
                tile.className = `tile ${(r + c) % 2 === 0 ? "light" : "dark"}`;
                tile.dataset.row = r;
                tile.dataset.col = c;

                // RF-CB-02: Resaltado de última jugada y selección
                if ((lastFrom && lastFrom.row === r && lastFrom.col === c) ||
                    (lastTo && lastTo.row === r && lastTo.col === c)) {
                    tile.classList.add("last-move");
                }
                if (selectedSquare && selectedSquare.row === r && selectedSquare.col === c) {
                    tile.classList.add("selected");
                }

                const piece = board[r] ? board[r][c] : null;
                const hasPiece = this.isActivePiece(piece);

                // RF-CB-04: Sugerencias de movimiento
                if (legalMoves && legalMoves.some(m => m.row === r && m.col === c)) {
                    const indicator = document.createElement("div");
                    indicator.className = hasPiece ? "capture-ring" : "move-dot";
                    tile.appendChild(indicator);
                }

                // RF-CB-03: Dibujo de piezas
                if (hasPiece) {
                    const pieceSpan = document.createElement("span");
                    pieceSpan.className = this.colorName(piece) === "COLORWHITE" ? "piece-white" : "piece-black";
                    pieceSpan.textContent = getPieceGlyph(piece);
                    tile.appendChild(pieceSpan);
                }

                tile.addEventListener("click", () => {
                    if (this.onSquareClick) this.onSquareClick(r, c);
                });

                this.element.appendChild(tile);
            }
        }
    }

    isActivePiece(piece) {
        return !!(piece && piece.type && piece.type._name !== "PIECEEMPTY");
    }

    colorName(piece) {
        return piece && piece.color ? (piece.color._name || piece.color.name || "") : "";
    }

    getElement() {
        return this.wrapper;
    }
}
