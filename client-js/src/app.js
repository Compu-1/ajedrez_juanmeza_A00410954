import { chessClientService } from "./services/chessClientService.js";
import { Header } from "./components/Header.js";
import { LobbyView } from "./components/LobbyView.js";
import { GameView } from "./components/GameView.js";

class ChessApplication {
    constructor(rootElement) {
        this.rootElement = rootElement;
        this.clientService = chessClientService;

        this.header = new Header();
        this.lobbyView = new LobbyView({
            onConnect: (params) => this.handleConnect(params),
            onCreateRoom: (nickname) => this.handleCreateRoom(nickname),
            onJoinRoom: (roomCode, nickname) => this.handleJoinRoom(roomCode, nickname),
            onRefresh: () => this.refreshLobby()
        });
        this.gameView = new GameView({
            onMove: (fromRow, fromCol, toRow, toCol) => this.handleMove(fromRow, fromCol, toRow, toCol),
            onResign: () => this.handleResign(),
            onLeaveRoom: () => this.handleLeaveRoom()
        });
    }

    mount() {
        this.rootElement.replaceChildren();

        const viewContainer = document.createElement("div");
        viewContainer.className = "view-container";
        viewContainer.appendChild(this.lobbyView.getElement());
        viewContainer.appendChild(this.gameView.getElement());

        this.rootElement.appendChild(this.header.getElement());
        this.rootElement.appendChild(viewContainer);
    }

    async handleConnect({ host, port, nickname }) {
        this.lobbyView.setConnectingState();
        try {
            await this.clientService.connect(host, port, nickname);
            this.header.setConnected(true);
            this.lobbyView.setConnectionState(true);
            await this.refreshLobby();
        } catch (err) {
            console.error("Error conectando con ZeroC Ice:", err);
            this.header.setConnected(false);
            this.lobbyView.setConnectionState(false);
            alert(`No fue posible conectar con el servidor Ice en ws://${host}:${port}`);
        }
    }

    async refreshLobby() {
        try {
            const { rooms, leaderboard } = await this.clientService.getLobbyData();
            this.lobbyView.updateRooms(rooms);
            this.lobbyView.updateLeaderboard(leaderboard);
        } catch (err) {
            console.warn("Error actualizando datos del lobby:", err);
        }
    }

    async handleCreateRoom(nickname) {
        try {
            const roomCode = await this.clientService.createRoom(nickname);
            await this.handleJoinRoom(roomCode, nickname);
        } catch (err) {
            alert("Error creando sala: " + (err.reason || err.message));
        }
    }

    async handleJoinRoom(roomCode, nickname) {
        if (!roomCode || !roomCode.trim()) {
            alert("Ingresa un código de sala válido.");
            return;
        }

        try {
            console.log(`[CLIENT-JS] Uniéndose a sala ${roomCode} con nickname ${nickname}...`);
            const result = await this.clientService.joinRoom(roomCode, nickname);

            this.lobbyView.hide();
            this.gameView.initSession(
                this.clientService.currentRoomCode,
                result.role,
                result.assignedColor,
                result.state
            );
            this.gameView.show();

            // 1. Forzar primera actualización gráfica inmediata con el estado devuelto
            this.gameView.updateState(result.state);

            // 2. Suscribir explícitamente el observador en tiempo real por WebSockets BiDir
            console.log("[CLIENT-JS] Iniciando registro de Observador BiDir...");
            await this.clientService.subscribeToRoom({
                onStateChanged: (newState) => this.handleGameStateChanged(newState),
                onGameFinished: (_finalState, winnerNickname, pointsDelta) => {
                    const msg = (!winnerNickname || winnerNickname.trim() === "")
                        ? "La partida ha concluido en tablas (+5 pts para ambos)."
                        : `¡Ganador: ${winnerNickname}! (+${pointsDelta} pts)`;
                    setTimeout(() => alert(msg), 100);
                }
            });
        } catch (err) {
            console.error("[CLIENT-JS] Error en handleJoinRoom:", err);
            alert(`No fue posible unirse a la sala ${roomCode.trim().toUpperCase()}:\n${err.reason || err.message}`);
        }
    }

    handleGameStateChanged(newState) {
        console.log("-> [App JS] Re-renderizando pantalla por evento Push:", newState);
        if (this.gameView && typeof this.gameView.updateState === "function") {
            this.gameView.updateState(newState);
        }
    }

    async handleMove(fromRow, fromCol, toRow, toCol) {
        try {
            await this.clientService.makeMove(fromRow, fromCol, toRow, toCol);
        } catch (err) {
            alert("Movimiento inválido: " + (err.reason || err.message));
        }
    }

    async handleResign() {
        if (!confirm("¿Estás seguro de que deseas rendirte? La victoria se otorgará a tu oponente.")) {
            return;
        }
        try {
            await this.clientService.resign();
        } catch (err) {
            alert("Error al rendirse: " + (err.reason || err.message));
        }
    }

    async handleLeaveRoom() {
        await this.clientService.leaveRoom();
        this.gameView.hide();
        this.lobbyView.show();
        await this.refreshLobby();
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const rootElement = document.getElementById("root");
    if (!rootElement) {
        console.error("No se encontró el elemento #root en el DOM.");
        return;
    }
    const app = new ChessApplication(rootElement);
    app.mount();
});