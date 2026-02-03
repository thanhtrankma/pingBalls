import { Routes, Route, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import BallsPing from './components/BallsPing';
import CircleGapBalls from './components/CircleGapBalls';
import './App.css';

function App() {
  const location = useLocation();
  return (
    <div className="App">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/balls-ping" element={<BallsPing key={location.key} />} />
        <Route path="/circle-gap-balls" element={<CircleGapBalls key={location.key} />} />
      </Routes>
    </div>
  );
}

export default App;
