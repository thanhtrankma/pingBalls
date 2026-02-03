import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import p5 from 'p5';

const GAP_FRACTION = 1 / 8; // Vòng tròn khuyết 1/7
const CIRCLE_RADIUS = 220;
const FLY_OUT_EXTRA = 55;   // Bóng bay ra khỏi vết khuyết thêm N px rồi mới biến mất — không cụt ở cửa
const INITIAL_BALLS = 2;
const GRAVITY = 0.15;
const MAX_SPAWN_PAIRS_NORMAL = 6;   // Mỗi frame tối đa 6 cặp (12 bóng)
const MAX_SPAWN_PAIRS_WHEN_BACKLOG = 15; // Hàng đợi nhiều: 15 cặp (30 bóng)/frame
const MAX_SPAWN_PAIRS_QUEUE_FULL = 28;   // Hàng đợi rất đông (r=6): 28 cặp (56 bóng)/frame — xả nhanh để vòng đầy
const SPAWN_BACKLOG_THRESHOLD = 6;   // Số cặp chờ >= 6 thì dùng tốc độ backlog
const SPAWN_QUEUE_FULL_THRESHOLD = 25;  // Số cặp chờ >= 25 thì xả tối đa (cho bóng nhỏ)
const MAX_SPAWN_QUEUE_PAIRS = 150;   // Queue đủ lớn để mọi bóng rơi ra đều được thay thế
const PACKING_RATIO = 0.82;          // Tỷ lệ lấp đầy ước tính (hình tròn trong vòng tròn)
const MAX_TARGET_BALLS = 380;       // Giới hạn mục tiêu để tránh lag khi bóng rất nhỏ
const AUTO_FILL_INTERVAL_BASE = 12; // Chu kỳ tự bổ sung (sẽ ngắn hơn khi bóng nhỏ)
// Chỉ nảy tường tỉ lệ nghịch với số bóng; bóng chạm nhau luôn nảy mạnh
const BOUNCE_AT_FEW_BALLS = 1.0;     // Hệ số nảy (tường) khi ít bóng
const BOUNCE_AT_MANY_BALLS = 0.2;    // Hệ số nảy (tường) khi nhiều bóng
const BALL_BALL_BOUNCE_FEW = 2;    // Bóng chạm bóng: nảy mạnh khi ít bóng
const BALL_BALL_BOUNCE_MANY = 1;  // Bóng chạm bóng: nảy yếu khi nhiều bóng
const BALL_COUNT_FOR_LOW_BOUNCE = 45; // Từ ngưỡng này trở lên coi là "nhiều bóng" (tường + bóng-bóng)
const RELAX_ITERATIONS_WHEN_MANY = 4;   // Số lần lặp tách bóng khi nhiều bóng
const RELAX_ITERATIONS_WHEN_VERY_MANY = 8; // Khi rất nhiều bóng — tách kỹ hơn, tránh chồng chéo
const BALL_COUNT_FOR_RELAX = 18;        // Từ ngưỡng này trở lên thì chạy nhiều vòng tách
const BALL_COUNT_FOR_HEAVY_RELAX = 55; // Từ ngưỡng này trở lên thì 8 vòng tách
const BALL_GAP = 1.2;                  // Khoảng cách tối thiểu (px) giữa hai bóng — nhìn rõ từng quả
const FLAG_RED = [0xDA, 0x25, 0x1D];
const FLAG_YELLOW = [0xFF, 0xD7, 0x00];

const WALL_HIT_FREQ_MIN = 180;
const WALL_HIT_FREQ_MAX = 280;
const WALL_HIT_AMP = 0.1;
const WALL_HIT_DURATION_MS = 45;

let balls = [];
let circleRotation = 0;
let flagBuffer = null;
let p5Instance = null;
let ballSizeSlider = null;
let rotationSpeedSlider = null;
let resetButton = null;
let spawnQueue = []; // Mỗi phần tử = 2 (spawn 2 bóng). Mỗi frame xử lý tối đa MAX_SPAWN_PAIRS_PER_FRAME cặp.

function drawStar(p5, cx, cy, outerR, innerR, n) {
  p5.beginShape();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (i * Math.PI) / n - Math.PI / 2;
    p5.vertex(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
  }
  p5.endShape(p5.CLOSE);
}

function createFlagBuffer(p5Inst) {
  const d = Math.floor(CIRCLE_RADIUS * 2);
  const pg = p5Inst.createGraphics(d, d);
  pg.pixelDensity(1);
  pg.background(FLAG_RED[0], FLAG_RED[1], FLAG_RED[2]);
  pg.fill(FLAG_YELLOW[0], FLAG_YELLOW[1], FLAG_YELLOW[2]);
  pg.noStroke();
  pg.push();
  pg.translate(d / 2, d / 2);
  drawStar(pg, 0, 0, d * 0.2, d * 0.08, 5);
  pg.pop();
  pg.loadPixels();
  return pg;
}

function getFlagColorAt(p5Inst, worldX, worldY, cx, cy) {
  if (!flagBuffer) return p5Inst.color(255);
  const dx = worldX - cx;
  const dy = worldY - cy;
  const cos = Math.cos(-circleRotation);
  const sin = Math.sin(-circleRotation);
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;
  const px = (localX + CIRCLE_RADIUS);
  const py = (localY + CIRCLE_RADIUS);
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  if (ix < 0 || ix >= flagBuffer.width || iy < 0 || iy >= flagBuffer.height) {
    return p5Inst.color(FLAG_RED[0], FLAG_RED[1], FLAG_RED[2]);
  }
  const i = (iy * flagBuffer.width + ix) * 4;
  return p5Inst.color(
    flagBuffer.pixels[i],
    flagBuffer.pixels[i + 1],
    flagBuffer.pixels[i + 2]
  );
}

function isInGap(angle) {
  let a = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const gapStart = 2 * Math.PI * (1 - GAP_FRACTION);
  return a >= gapStart;
}

function getBallRadius() {
  return ballSizeSlider ? ballSizeSlider.value() : 12;
}

// Số bóng cần để vòng tròn đầy — phụ thuộc kích cỡ bóng (bóng nhỏ = cần nhiều hơn)
function getTargetBallsForFull() {
  const r = getBallRadius();
  if (r <= 0) return 100;
  const n = Math.floor(PACKING_RATIO * (CIRCLE_RADIUS / r) ** 2);
  return Math.min(MAX_TARGET_BALLS, Math.max(60, n));
}

function getRotationSpeed() {
  return rotationSpeedSlider ? rotationSpeedSlider.value() / 1000 : 0.005;
}

function playWallHitSound(p5Inst) {
  try {
    const ctx = p5Inst.getAudioContext && p5Inst.getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = WALL_HIT_FREQ_MIN + Math.random() * (WALL_HIT_FREQ_MAX - WALL_HIT_FREQ_MIN);
    gain.gain.value = WALL_HIT_AMP;
    osc.start(0);
    osc.stop(ctx.currentTime + WALL_HIT_DURATION_MS / 1000);
  } catch (_) {}
}

function spawnBall(p5Inst, cx, cy) {
  const r = getBallRadius();
  const angle = p5Inst.random(0, 2 * Math.PI);
  const speed = p5Inst.random(2, 5);
  const vx = Math.cos(angle) * speed;
  const vy = Math.sin(angle) * speed;
  balls.push({
    x: cx + p5Inst.random(-5, 5),
    y: cy + p5Inst.random(-5, 5),
    vx,
    vy,
    r,
  });
}

function resetGame(p5) {
  balls = [];
  spawnQueue = [];
  const cx = p5.width / 2;
  const cy = 300;
  for (let i = 0; i < INITIAL_BALLS; i++) spawnBall(p5, cx, cy);
}

export default function CircleGapBalls() {
  const sketchRef = useRef(null);
  const p5Ref = useRef(null);
  const [soundEnabled, setSoundEnabled] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const sketch = (p5) => {
      p5.setup = () => {
        p5Ref.current = p5;
        p5.createCanvas(600, 640);
        flagBuffer = createFlagBuffer(p5);

        // Thanh điều chỉnh kích cỡ bóng (6–24)
        p5.createP('Kích cỡ bóng:').position(20, 610).style('color', 'white');
        ballSizeSlider = p5.createSlider(6, 24, 12, 1);
        ballSizeSlider.position(150, 625);

        // Thanh điều chỉnh tốc độ xoay vòng tròn (1–20, đơn vị 0.001)
        p5.createP('Tốc độ xoay:').position(20, 650).style('color', 'white');
        rotationSpeedSlider = p5.createSlider(1, 20, 5, 1);
        rotationSpeedSlider.position(150, 665);

        // Nút Reset
        resetButton = p5.createButton('Bắt đầu lại (Reset)');
        resetButton.position(350, 640);
        resetButton.size(150, 40);
        resetButton.mousePressed(() => resetGame(p5));

        balls = [];
        circleRotation = 0;
        for (let i = 0; i < INITIAL_BALLS; i++) spawnBall(p5, p5.width / 2, 300);
      };

      p5.draw = () => {
        const cx = p5.width / 2;
        const cy = 300;
        p5.background(18);

        let wallSoundPlayedThisFrame = false;

        const rotationSpeed = getRotationSpeed();
        circleRotation += rotationSpeed;

        // Tự bổ sung: mục tiêu số bóng theo kích cỡ (bóng nhỏ = mục tiêu cao hơn), thêm queue để vòng đầy
        const targetBalls = getTargetBallsForFull();
        const autoInterval = targetBalls > 150 ? 5 : AUTO_FILL_INTERVAL_BASE; // Bóng nhỏ → bổ sung nhanh hơn
        const pairsToAdd = targetBalls > 200 ? 2 : 1; // Bóng rất nhỏ → thêm 2 cặp mỗi lần
        if (p5.frameCount % autoInterval === 0 && balls.length < targetBalls && spawnQueue.length < MAX_SPAWN_QUEUE_PAIRS) {
          for (let a = 0; a < pairsToAdd; a++) spawnQueue.push(2);
        }
        // Spawn từ hàng đợi: 3 mức — bình thường / backlog / queue rất đông (xả nhanh cho bóng nhỏ)
        let pairsThisFrame = MAX_SPAWN_PAIRS_NORMAL;
        if (spawnQueue.length >= SPAWN_QUEUE_FULL_THRESHOLD) pairsThisFrame = MAX_SPAWN_PAIRS_QUEUE_FULL;
        else if (spawnQueue.length >= SPAWN_BACKLOG_THRESHOLD) pairsThisFrame = MAX_SPAWN_PAIRS_WHEN_BACKLOG;
        for (let k = 0; k < pairsThisFrame && spawnQueue.length > 0; k++) {
          const count = spawnQueue.shift();
          for (let i = 0; i < count; i++) spawnBall(p5, cx, cy);
        }

        // Nền trong suốt (không vẽ cờ) — chỉ bóng mới có màu cờ theo vị trí

        // Vẽ vòng tròn khuyết 1/7 (chỉ viền - một cung từ 0 đến 6/7*2*PI)
        p5.push();
        p5.translate(cx, cy);
        p5.rotate(circleRotation);
        p5.noFill();
        p5.stroke(255, 200);
        p5.strokeWeight(4);
        const arcEnd = 2 * Math.PI * (1 - GAP_FRACTION);
        p5.arc(0, 0, CIRCLE_RADIUS * 2, CIRCLE_RADIUS * 2, 0, arcEnd);
        p5.pop();

        // Bước 1: Cập nhật vị trí (trọng lực + vận tốc)
        for (let i = 0; i < balls.length; i++) {
          const b = balls[i];
          b.vy += GRAVITY;
          b.x += b.vx;
          b.y += b.vy;
        }

        // Nảy tường tỉ lệ nghịch với số bóng (nhiều bóng → tường nảy yếu → ít rơi ra)
        const numBalls = balls.length;
        const t = Math.min(1, numBalls / BALL_COUNT_FOR_LOW_BOUNCE);
        const wallBounce = BOUNCE_AT_FEW_BALLS * (1 - t) + BOUNCE_AT_MANY_BALLS * t;
        const ballBallBounce = BALL_BALL_BOUNCE_FEW * (1 - t) + BALL_BALL_BOUNCE_MANY * t;

        // Bước 2a: Khi nhiều bóng — nhiều vòng lặp tách vị trí + giữ khoảng cách BALL_GAP (tránh chồng chéo)
        const relaxIters = numBalls >= BALL_COUNT_FOR_HEAVY_RELAX ? RELAX_ITERATIONS_WHEN_VERY_MANY
          : numBalls >= BALL_COUNT_FOR_RELAX ? RELAX_ITERATIONS_WHEN_MANY : 1;
        const minDistWithGap = (b1, b2) => b1.r + b2.r + BALL_GAP;
        for (let iter = 0; iter < relaxIters; iter++) {
          for (let i = 0; i < balls.length; i++) {
            for (let j = i + 1; j < balls.length; j++) {
              const b1 = balls[i];
              const b2 = balls[j];
              const dx = b2.x - b1.x;
              const dy = b2.y - b1.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              const minD = minDistWithGap(b1, b2);
              if (dist < minD && dist > 0.001) {
                const nx = dx / dist;
                const ny = dy / dist;
                const overlap = minD - dist;
                b1.x -= nx * (overlap / 2);
                b1.y -= ny * (overlap / 2);
                b2.x += nx * (overlap / 2);
                b2.y += ny * (overlap / 2);
              }
            }
          }
        }
        // Bước 2b: Va chạm bóng–bóng — cập nhật vận tốc (độ nảy giảm theo số bóng), cùng khoảng cách BALL_GAP
        for (let i = 0; i < balls.length; i++) {
          for (let j = i + 1; j < balls.length; j++) {
            const b1 = balls[i];
            const b2 = balls[j];
            const dx = b2.x - b1.x;
            const dy = b2.y - b1.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const minD = minDistWithGap(b1, b2);
            if (dist < minD && dist > 0.001) {
              const nx = dx / dist;
              const ny = dy / dist;
              const v1n = b1.vx * nx + b1.vy * ny;
              const v2n = b2.vx * nx + b2.vy * ny;
              b1.vx += (v2n - v1n) * ballBallBounce * nx;
              b1.vy += (v2n - v1n) * ballBallBounce * ny;
              b2.vx += (v1n - v2n) * ballBallBounce * nx;
              b2.vy += (v1n - v2n) * ballBallBounce * ny;
            }
          }
        }

        // Bước 3: Va chạm vòng tròn và kiểm tra rơi ra
        for (let i = balls.length - 1; i >= 0; i--) {
          const b = balls[i];
          const dx = b.x - cx;
          const dy = b.y - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const localAngle = Math.atan2(dy, dx);
          const normalizedAngle = ((localAngle - circleRotation) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);

          // Chỉ xóa khi bóng đã bay ra xa khỏi cửa khuyết (hiệu ứng bay ra, không cụt ở miệng)
          if (dist > CIRCLE_RADIUS + b.r + FLY_OUT_EXTRA) {
            balls.splice(i, 1);
            if (spawnQueue.length < MAX_SPAWN_QUEUE_PAIRS) spawnQueue.push(2);
            continue;
          }

          if (dist >= CIRCLE_RADIUS - b.r && !isInGap(normalizedAngle)) {
            const nx = dx / dist;
            const ny = dy / dist;
            const dot = b.vx * nx + b.vy * ny;
            if (dot > 0) {
              if (!wallSoundPlayedThisFrame) {
                playWallHitSound(p5);
                wallSoundPlayedThisFrame = true;
              }
              b.vx -= (1 + wallBounce) * dot * nx;
              b.vy -= (1 + wallBounce) * dot * ny;
              b.x = cx + nx * (CIRCLE_RADIUS - b.r - 2);
              b.y = cy + ny * (CIRCLE_RADIUS - b.r - 2);
            }
          }
        }

        // Bước 3b: Ép mọi bóng về trong vòng tròn (tránh bị đẩy ra ngoài khi nhiều bóng)
        for (let i = 0; i < balls.length; i++) {
          const b = balls[i];
          const dx = b.x - cx;
          const dy = b.y - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist <= 0.001) continue;
          const localAngle = Math.atan2(dy, dx);
          const normalizedAngle = ((localAngle - circleRotation) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
          if (dist > CIRCLE_RADIUS - b.r && !isInGap(normalizedAngle)) {
            const nx = dx / dist;
            const ny = dy / dist;
            b.x = cx + nx * (CIRCLE_RADIUS - b.r - 0.5);
            b.y = cy + ny * (CIRCLE_RADIUS - b.r - 0.5);
            const outward = b.vx * nx + b.vy * ny;
            if (outward > 0) {
              b.vx -= outward * nx;
              b.vy -= outward * ny;
            }
          }
        }

        // Bước 4: Vẽ bóng — sắp xếp theo y; viền rõ khi nhiều bóng để nhìn rõ từng quả
        const sortedBalls = [...balls].sort((a, b) => a.y - b.y);
        const strokeAlpha = numBalls >= 40 ? 240 : numBalls >= 20 ? 200 : 160;
        const strokeW = numBalls >= 60 ? 2 : 1.5;
        for (let i = 0; i < sortedBalls.length; i++) {
          const b = sortedBalls[i];
          const col = getFlagColorAt(p5, b.x, b.y, cx, cy);
          p5.fill(col);
          // p5.stroke(255, strokeAlpha);
          // p5.strokeWeight(strokeW);
          p5.circle(b.x, b.y, b.r * 2);
        }
        p5.noStroke();

        p5.fill(255);
        p5.noStroke();
        p5.textSize(14);
        p5.text(`Bóng: ${balls.length} | Chờ spawn: ${spawnQueue.reduce((a, n) => a + n, 0)} bóng | Kích cỡ: ${getBallRadius()} | Xoay: ${getRotationSpeed().toFixed(3)}`, 20, 25);
      };
    };

    (async () => {
      if (typeof window !== 'undefined') {
        window.p5 = p5;
        await import('p5/lib/addons/p5.sound');
      }
      if (!isMounted) return;
      await new Promise((r) => requestAnimationFrame(r));
      if (!isMounted) return;
      if (!sketchRef.current) return;
      p5Instance = new p5(sketch, sketchRef.current);
    })();

    return () => {
      isMounted = false;
      if (p5Instance) {
        p5Instance.remove();
        p5Instance = null;
      }
      balls = [];
      spawnQueue = [];
      flagBuffer = null;
      ballSizeSlider = null;
      rotationSpeedSlider = null;
      resetButton = null;
    };
  }, []);

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div
        style={{
          width: '100%',
          maxWidth: 600,
          padding: '10px 20px',
          display: 'flex',
          justifyContent: 'flex-start',
          alignItems: 'center',
          backgroundColor: 'rgba(10, 10, 10, 0.95)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          boxSizing: 'border-box',
        }}
      >
        <Link
          to="/"
          style={{
            padding: '8px 16px',
            fontSize: '14px',
            backgroundColor: 'rgba(255,255,255,0.08)',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.15)',
          }}
        >
          ← Về trang chủ
        </Link>
      </div>
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <div ref={sketchRef} />
        {!soundEnabled && (
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              const ctx = p5Ref.current?.getAudioContext?.();
              if (ctx && typeof ctx.resume === 'function') ctx.resume();
              setSoundEnabled(true);
            }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const ctx = p5Ref.current?.getAudioContext?.(); if (ctx && typeof ctx.resume === 'function') ctx.resume(); setSoundEnabled(true); } }}
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.6)',
              color: '#fff',
              fontSize: 16,
              cursor: 'pointer',
              borderRadius: 8,
            }}
          >
            Nhấn để bật âm thanh
          </div>
        )}
      </div>
    </div>
  );
}
