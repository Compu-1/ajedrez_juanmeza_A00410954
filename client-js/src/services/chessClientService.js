import { chessRealtimeObserver } from "./chessRealtimeObserver.js";

export class ChessClientService {
  constructor() {
    this.communicator = null;
    this.servicePrx = null;
    this.currentRoomCode = null;
    this.currentNickname = null;
  }

  async connect(host = "127.0.0.1", port = 10002) {
    const initData = new Ice.InitializationData();
    initData.properties = Ice.createProperties();
    initData.properties.setProperty("Ice.MessageSizeMax", "2048");
    initData.properties.setProperty("Ice.ACM.Client.Timeout", "0");
    initData.properties.setProperty("Ice.ACM.Client.Heartbeat", "3");

    this.communicator = Ice.initialize(initData);
    const proxyStr = `ChessService:ws -h ${host} -p ${port}`;
    const basePrx = this.communicator.stringToProxy(proxyStr);

    this.servicePrx = await window.ChessApp.ChessServicePrx.checkedCast(basePrx);
    if (!this.servicePrx) {
      throw new Error("Proxy de ChessService no válido.");
    }
    return this.servicePrx;
  }

  async getLobbyData() {
    const [rooms, leaderboard] = await Promise.all([
      this.servicePrx.getActiveRooms(),
      this.servicePrx.getLeaderboard()
    ]);
    return { rooms, leaderboard };
  }

  async createRoom(nickname) {
    this.currentNickname = nickname ? nickname.trim() : "";
    return await this.servicePrx.createRoom(this.currentNickname);
  }

  async joinRoom(roomCode, nickname) {
    this.currentRoomCode = roomCode ? roomCode.trim() : "";
    this.currentNickname = nickname ? nickname.trim() : "";

    const res = await this.servicePrx.joinRoom(this.currentRoomCode, this.currentNickname);
    return {
      role: res.role !== undefined ? res.role : res._role,
      assignedColor: res.assignedColor !== undefined ? res.assignedColor : res._assignedColor,
      state: res.state !== undefined ? res.state : res._state
    };
  }

  async subscribeToRoom(callbacks) {
    if (!this.communicator || !this.servicePrx || !this.currentRoomCode || !this.currentNickname) {
      return;
    }
    await chessRealtimeObserver.subscribe(
      this.communicator,
      this.servicePrx,
      this.currentRoomCode,
      this.currentNickname,
      callbacks
    );
  }

  async makeMove(fromRow, fromCol, toRow, toCol) {
    if (!this.currentRoomCode || !this.currentNickname) {
      throw new Error("No hay una sesión activa de jugador en la sala.");
    }
    const fromPos = new window.ChessApp.Position(fromRow, fromCol);
    const toPos = new window.ChessApp.Position(toRow, toCol);
    return await this.servicePrx.makeMove(
      this.currentRoomCode,
      this.currentNickname,
      fromPos,
      toPos
    );
  }

  async resign() {
    await this.servicePrx.resign(this.currentRoomCode, this.currentNickname);
  }

  async leaveRoom() {
    if (this.currentRoomCode && this.currentNickname) {
      try {
        await chessRealtimeObserver.unsubscribe(
          this.servicePrx,
          this.currentRoomCode,
          this.currentNickname
        );
        await this.servicePrx.leaveRoom(this.currentRoomCode, this.currentNickname);
      } catch (e) {
        console.warn("Error al abandonar la sala:", e);
      }
    }
    this.currentRoomCode = null;
  }
}

export const chessClientService = new ChessClientService();