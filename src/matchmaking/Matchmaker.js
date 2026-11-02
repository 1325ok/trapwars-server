export class Matchmaker {
  constructor() {
    this.waiting = [];
  }

  queue(ws) {
    if (this.waiting.includes(ws)) return false;
    this.waiting.push(ws);
    return true;
  }

  remove(ws) {
    const index = this.waiting.indexOf(ws);
    if (index >= 0) {
      this.waiting.splice(index, 1);
      return true;
    }
    return false;
  }

  getOpponent(ws) {
    const opponent = this.waiting.find((candidate) => candidate !== ws && candidate.readyState === 1);
    if (opponent) {
      this.remove(opponent);
      return opponent;
    }
    return null;
  }

  size() {
    return this.waiting.length;
  }

  isWaiting(ws) {
    return this.waiting.includes(ws);
  }
}
