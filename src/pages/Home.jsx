import { Link } from 'react-router-dom';
import { games } from '../config/games';
import './Home.css';

export default function Home() {
  return (
    <div className="home">
      <header className="home-header">
        <h1 className="home-title">🎯 Circle Games</h1>
        <p className="home-subtitle">Chọn trò chơi bạn muốn chơi</p>
      </header>

      <main className="home-games">
        {games.map((game) => (
          <Link
            key={game.id}
            to={game.path}
            className="game-card"
            style={{ '--card-color': game.color }}
          >
            <div
              className="game-card-bg"
              style={{ background: game.gradient }}
            />
            <span className="game-card-icon">{game.icon}</span>
            <h2 className="game-card-title">{game.title}</h2>
            <p className="game-card-desc">{game.description}</p>
            <span className="game-card-cta">Chơi ngay →</span>
          </Link>
        ))}
      </main>

      <footer className="home-footer">
        <p>Ping balls in Viet Nam</p>
      </footer>
    </div>
  );
}
