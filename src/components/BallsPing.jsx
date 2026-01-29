import { useEffect, useRef, useState } from 'react';
import p5 from 'p5';

let balls = [];
let circleRadius = 250;
let maxSpeed = 30;
let friction = 0.99;
let osc;
let ballSlider, speedSlider;
let resetButton;

let circleGlowColor;
let circleGlowIntensity = 0;
let startTime = null;

class Ball {
  constructor(x, y, col, id, r, mSpeed, p5Instance) {
    this.p5 = p5Instance;
    this.pos = p5Instance.createVector(x, y);
    this.vel = p5.Vector.random2D().mult(mSpeed);
    this.col = col;
    this.id = id;
    this.r = r;
    this.lines = [];
    this.hasStarted = false;
  }

  update(currentMinSpeed) {
    this.vel.mult(friction);

    let currentSpeed = this.vel.mag();
    if (currentSpeed < currentMinSpeed) this.vel.setMag(currentMinSpeed);
    if (currentSpeed > maxSpeed) this.vel.setMag(maxSpeed);

    this.pos.add(this.vel);
  }

  display() {
    const p5 = this.p5;
    p5.drawingContext.shadowBlur = 20;
    p5.drawingContext.shadowColor = this.col;

    p5.stroke(this.col);
    p5.strokeWeight(p5.map(this.r, 5, 30, 1.5, 4));
    for (let l of this.lines) {
      p5.line(l.x, l.y, this.pos.x, this.pos.y);
    }

    p5.noStroke();
    p5.fill(this.col);
    p5.ellipse(this.pos.x, this.pos.y, this.r * 2);
    p5.drawingContext.shadowBlur = 0;
  }

  checkWall() {
    const p5 = this.p5;
    let d = this.pos.mag();
    if (d + this.r > circleRadius) {
      circleGlowColor = this.col;
      circleGlowIntensity = 255;

      let n = this.pos.copy().normalize();
      this.lines.push(n.copy().mult(circleRadius));
      this.pos = n.copy().mult(circleRadius - this.r);
      let dot = this.vel.dot(n);
      this.vel.sub(n.mult(2 * dot));
      this.hasStarted = true;
      playCollisionSound(350 + (this.id * 25), p5);
    }
  }

  checkIfLinesCut(opponent) {
    const p5 = this.p5;
    for (let i = this.lines.length - 1; i >= 0; i--) {
      let d = this.distToSegment(opponent.pos, this.lines[i], this.pos, p5);
      if (d < opponent.r) {
        this.lines.splice(i, 1);
      }
    }
  }

  distToSegment(p, v, w, p5) {
    let l2 = p5.dist(v.x, v.y, w.x, w.y) ** 2;
    if (l2 == 0) return p5.dist(p.x, p.y, v.x, v.y);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = p5.max(0, p5.min(1, t));
    return p5.dist(
      p.x,
      p.y,
      v.x + t * (w.x - v.x),
      v.y + t * (w.y - v.y)
    );
  }
}

function playCollisionSound(freq, p5) {
  osc.freq(freq);
  osc.amp(0.2, 0.05);
  osc.amp(0, 0.2);
}

function checkBallCollision(b1, b2, p5) {
  let distance = p5.dist(b1.pos.x, b1.pos.y, b2.pos.x, b2.pos.y);
  if (distance < b1.r + b2.r) {
    let collisionVec = p5.createVector(
      b1.pos.x - b2.pos.x,
      b1.pos.y - b2.pos.y
    ).normalize();
    b1.vel.reflect(collisionVec);
    b2.vel.reflect(collisionVec.copy().mult(-1));
    b1.vel.mult(2);
    b2.vel.mult(2);

    let overlap = (b1.r + b2.r) - distance;
    b1.pos.add(collisionVec.copy().mult(overlap / 2 + 1));
    b2.pos.sub(collisionVec.copy().mult(overlap / 2 + 1));
    playCollisionSound(150 + (b1.id * 15), p5);
  }
}

function initGame(p5) {
  balls = [];
  circleGlowIntensity = 0;
  startTime = Date.now(); // Reset thời gian bắt đầu
  let numBalls = ballSlider.value();
  let currentMinSpeed = speedSlider.value();
  let dynamicRadius = p5.map(numBalls, 1, 100, 30, 5);

  for (let i = 0; i < numBalls; i++) {
    let angle = (p5.TWO_PI / numBalls) * i;
    let x = p5.cos(angle) * 120;
    let y = p5.sin(angle) * 120;
    let col = p5.color(p5.random(100, 255), p5.random(100, 255), p5.random(100, 255));
    balls.push(new Ball(x, y, col, i, dynamicRadius, currentMinSpeed, p5));
  }
}

export default function BallsPing() {
  const sketchRef = useRef(null);
  const p5InstanceRef = useRef(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const resumeAudioRef = useRef(null);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const canvasStreamRef = useRef(null);
  const audioStreamRef = useRef(null);
  const audioDestinationRef = useRef(null);
  const isRecordingRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    const sketch = (p5Instance) => {
      p5Instance.setup = () => {
        p5Instance.createCanvas(600, 700);
        circleGlowColor = p5Instance.color(255);

        // p5.sound gắn Oscillator vào global p5, không phải instance
        osc = new p5.Oscillator('sine');
        osc.start();
        osc.amp(0);

        // UI: Số lượng bóng
        let labelBall = p5Instance.createP('Số lượng bóng:');
        labelBall.style('color', 'white');
        labelBall.position(20, 610);
        ballSlider = p5Instance.createSlider(1, 100, 6, 1);
        ballSlider.position(150, 625);

        // UI: Tốc độ tối thiểu
        let labelSpeed = p5Instance.createP('Tốc độ tối thiểu:');
        labelSpeed.style('color', 'white');
        labelSpeed.position(20, 650);
        speedSlider = p5Instance.createSlider(2, 15, 5, 1);
        speedSlider.position(150, 665);

        // Nút Reset
        resetButton = p5Instance.createButton('Bắt đầu lại (Reset)');
        resetButton.position(350, 640);
        resetButton.size(150, 40);
        resetButton.mousePressed(() => handleReset(p5Instance));

        // Lưu hàm resume audio để gọi từ overlay
        const audioCtx = p5Instance.getAudioContext();
        resumeAudioRef.current = async () => {
          if (audioCtx && audioCtx.state !== 'running') {
            await audioCtx.resume();
          }
          setAudioEnabled(true);
        };
        
        // Lưu AudioContext và method getAudioContext để dùng cho recording
        p5InstanceRef.current.audioContext = audioCtx;
        p5InstanceRef.current.getAudioContextMethod = () => p5Instance.getAudioContext();

        initGame(p5Instance);
      };

      p5Instance.draw = () => {
        p5Instance.background(10);

        p5Instance.drawingContext.shadowBlur = 0;
        p5Instance.fill(255);
        p5Instance.noStroke();
        p5Instance.textSize(14);
        p5Instance.text(`Bóng: ${balls.length} | Tốc độ sàn: ${speedSlider.value()}`, 20, 30);

        p5Instance.translate(p5Instance.width / 2, 320);
        
        // Tính toán và hiển thị thời gian ở giữa đường tròn
        let timeText = '';
        if (startTime) {
          const elapsed = Date.now() - startTime;
          const seconds = Math.floor(elapsed / 1000);
          const minutes = Math.floor(seconds / 60);
          const hours = Math.floor(minutes / 60);
          const displaySeconds = seconds % 60;
          const displayMinutes = minutes % 60;
          
          if (hours > 0) {
            timeText = `${hours.toString().padStart(2, '0')}:${displayMinutes.toString().padStart(2, '0')}:${displaySeconds.toString().padStart(2, '0')}`;
          } else {
            timeText = `${displayMinutes.toString().padStart(2, '0')}:${displaySeconds.toString().padStart(2, '0')}`;
          }
        } else {
          timeText = '00:00';
        }
        
        // Hiển thị thời gian ở giữa đường tròn với style đẹp
        p5Instance.push();
        p5Instance.translate(0, 0); // Đã ở giữa rồi (0, 0 sau khi translate)
        p5Instance.textAlign(p5Instance.CENTER, p5Instance.CENTER);
        p5Instance.textSize(72); // Text to
        p5Instance.fill(255, 255, 255, 20); // Màu trắng với opacity 120/255 (mờ mờ)
        p5Instance.noStroke();
        
        // Thêm shadow để đẹp hơn
        p5Instance.drawingContext.shadowBlur = 30;
        p5Instance.drawingContext.shadowColor = 'rgba(255, 255, 255, 0.3)';
        
        p5Instance.text(timeText, 0, 0);
        p5Instance.pop();

        // Vẽ vòng tròn phát sáng khi va chạm
        if (circleGlowIntensity > 0) {
          p5Instance.drawingContext.shadowBlur = p5Instance.map(circleGlowIntensity, 0, 255, 0, 40);
          p5Instance.drawingContext.shadowColor = circleGlowColor;
          p5Instance.stroke(
            p5Instance.red(circleGlowColor),
            p5Instance.green(circleGlowColor),
            p5Instance.blue(circleGlowColor),
            circleGlowIntensity
          );
          circleGlowIntensity -= 7;
        } else {
          p5Instance.drawingContext.shadowBlur = 0;
          p5Instance.stroke(255, 40);
        }

        p5Instance.strokeWeight(5);
        p5Instance.noFill();
        p5Instance.ellipse(0, 0, circleRadius * 2);

        // Va chạm bóng-bóng
        for (let i = 0; i < balls.length; i++) {
          for (let j = i + 1; j < balls.length; j++) {
            checkBallCollision(balls[i], balls[j], p5Instance);
          }
        }

        // Cập nhật và hiển thị
        for (let i = balls.length - 1; i >= 0; i--) {
          let b = balls[i];
          b.update(speedSlider.value());
          b.checkWall();
          for (let j = 0; j < balls.length; j++) {
            if (i !== j) b.checkIfLinesCut(balls[j]);
          }
          b.display();
          if (b.hasStarted && b.lines.length === 0) {
            balls.splice(i, 1);
          }
        }
      };
    };

    (async () => {
      if (typeof window !== 'undefined') {
        window.p5 = p5;
        await import('p5/lib/addons/p5.sound');
      }
      if (!isMounted) return;
      p5InstanceRef.current = new p5(sketch, sketchRef.current);
    })();

    return () => {
      isMounted = false;
      
      // Stop recording nếu đang recording
      if (mediaRecorderRef.current && isRecordingRef.current) {
        mediaRecorderRef.current.stop();
        isRecordingRef.current = false;
      }
      
      // Cleanup streams
      if (canvasStreamRef.current) {
        canvasStreamRef.current.getTracks().forEach(track => track.stop());
        canvasStreamRef.current = null;
      }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop());
        audioStreamRef.current = null;
      }
      if (audioDestinationRef.current) {
        // Khôi phục kết nối osc về destination ban đầu
        const audioCtx = p5InstanceRef.current?.audioContext;
        if (osc && osc.output && audioDestinationRef.current.masterGain && audioCtx) {
          try {
            osc.output.disconnect();
            osc.output.connect(audioCtx.destination);
          } catch (e) {
            // Ignore nếu có lỗi
          }
        }
        // Disconnect masterGain
        if (audioDestinationRef.current.masterGain) {
          audioDestinationRef.current.masterGain.disconnect();
        }
        // Disconnect scriptProcessor nếu có
        if (audioDestinationRef.current.scriptProcessor) {
          audioDestinationRef.current.scriptProcessor.disconnect();
        }
        audioDestinationRef.current = null;
      }
      
      if (p5InstanceRef.current) {
        p5InstanceRef.current.remove();
      }
      if (osc) {
        osc.stop();
        osc.dispose();
      }
    };
  }, []);

  const handleStartClick = () => {
    if (resumeAudioRef.current) {
      resumeAudioRef.current();
    }
  };

  const startRecording = async () => {
    try {
      if (!p5InstanceRef.current) {
        alert('Canvas chưa sẵn sàng. Vui lòng đợi một chút.');
        return;
      }

      // Lấy canvas element từ p5 instance
      const canvas = p5InstanceRef.current.canvas;
      if (!canvas) {
        alert('Canvas chưa sẵn sàng. Vui lòng đợi một chút.');
        return;
      }
      
      // Capture canvas stream với chất lượng cao
      const videoStream = canvas.captureStream(60); // 60 FPS
      canvasStreamRef.current = videoStream;

      // Capture audio từ Web Audio API
      let combinedStream = videoStream;
      
      // Lấy AudioContext từ p5 instance
      let audioCtx = null;
      
      // Thử nhiều cách để lấy AudioContext
      if (p5InstanceRef.current.getAudioContextMethod) {
        audioCtx = p5InstanceRef.current.getAudioContextMethod();
      } else if (p5InstanceRef.current.getAudioContext && typeof p5InstanceRef.current.getAudioContext === 'function') {
        audioCtx = p5InstanceRef.current.getAudioContext();
      } else if (p5InstanceRef.current.audioContext && p5InstanceRef.current.audioContext !== false) {
        audioCtx = p5InstanceRef.current.audioContext;
      }
      
      console.log('AudioContext được lấy:', {
        hasGetAudioContextMethod: !!p5InstanceRef.current.getAudioContextMethod,
        hasGetAudioContext: typeof p5InstanceRef.current.getAudioContext === 'function',
        hasAudioContext: !!p5InstanceRef.current.audioContext,
        audioCtxValue: p5InstanceRef.current.audioContext,
        audioCtx: !!audioCtx,
        state: audioCtx?.state,
        audioEnabled: audioEnabled
      });
      
      // Đảm bảo AudioContext đã được resume
      if (audioCtx) {
        if (audioCtx.state !== 'running') {
          try {
            await audioCtx.resume();
            console.log('AudioContext đã được resume:', audioCtx.state);
          } catch (e) {
            console.warn('Không thể resume AudioContext:', e);
            // Nếu không resume được, có thể cần user interaction
            if (!audioEnabled) {
              alert('Vui lòng click vào overlay để bật âm thanh trước khi ghi hình!');
              return;
            }
          }
        }
      } else {
        console.warn('Không thể lấy AudioContext từ p5 instance');
      }
      
      if (audioCtx && audioCtx.state === 'running' && osc) {
        try {
          console.log('Oscillator object:', osc);
          console.log('Oscillator output:', osc.output);
          console.log('Oscillator _oscillator:', osc._oscillator);
          
          // Tạo MediaStreamAudioDestinationNode để capture audio
          const audioDestination = audioCtx.createMediaStreamDestination();
          audioDestinationRef.current = audioDestination;
          
          // Tạo một GainNode làm master output để chia tín hiệu
          const masterGain = audioCtx.createGain();
          masterGain.gain.value = 1.0;
          
          // Kết nối masterGain với cả destination (để nghe) và audioDestination (để record)
          masterGain.connect(audioCtx.destination);
          masterGain.connect(audioDestination);
          
          // Thử nhiều cách để kết nối osc với masterGain
          let connected = false;
          
          // Cách 1: Thử qua osc.output
          if (osc.output && typeof osc.output.connect === 'function') {
            try {
              osc.output.disconnect();
              osc.output.connect(masterGain);
              connected = true;
              console.log('Đã kết nối qua osc.output');
            } catch (e) {
              console.warn('Không thể kết nối qua osc.output:', e);
            }
          }
          
          // Cách 2: Thử qua osc._oscillator (internal property)
          if (!connected && osc._oscillator && typeof osc._oscillator.connect === 'function') {
            try {
              osc._oscillator.disconnect();
              osc._oscillator.connect(masterGain);
              connected = true;
              console.log('Đã kết nối qua osc._oscillator');
            } catch (e) {
              console.warn('Không thể kết nối qua osc._oscillator:', e);
            }
          }
          
          // Cách 3: Thử connect trực tiếp
          if (!connected && typeof osc.connect === 'function') {
            try {
              osc.connect(masterGain);
              connected = true;
              console.log('Đã kết nối trực tiếp qua osc.connect');
            } catch (e) {
              console.warn('Không thể kết nối trực tiếp:', e);
            }
          }
          
          if (!connected) {
            throw new Error('Không thể kết nối oscillator với masterGain');
          }
          
          // Lưu masterGain để cleanup sau
          audioDestinationRef.current.masterGain = masterGain;
          audioDestinationRef.current.originalConnection = osc.output || osc._oscillator;
          
          // Kết hợp video và audio streams
          const audioTracks = audioDestination.stream.getAudioTracks();
          console.log('Audio tracks:', audioTracks.length);
          audioTracks.forEach(track => {
            console.log('Adding audio track:', track);
            combinedStream.addTrack(track);
          });
          
          audioStreamRef.current = audioDestination.stream;
          console.log('Audio capture đã được thiết lập');
        } catch (error) {
          console.error('Không thể capture audio:', error);
          // Tiếp tục với chỉ video nếu audio không khả dụng
        }
      } else {
        console.warn('AudioContext không sẵn sàng:', {
          audioCtx: !!audioCtx,
          state: audioCtx?.state,
          osc: !!osc,
          audioEnabled: audioEnabled
        });
        
        // Nếu audio chưa được enable, thử resume AudioContext tự động
        if (!audioEnabled && audioCtx) {
          try {
            if (audioCtx.state !== 'running') {
              await audioCtx.resume();
              setAudioEnabled(true);
              console.log('AudioContext đã được resume tự động');
            } else {
              setAudioEnabled(true);
            }
          } catch (e) {
            // Nếu không resume được, vẫn tiếp tục với recording (chỉ không có audio)
            console.warn('Không thể resume AudioContext tự động, tiếp tục recording không audio:', e);
          }
        }
      }

      // Tạo MediaRecorder với chất lượng cao nhất
      const options = {
        mimeType: 'video/webm;codecs=vp9,opus', // VP9 + Opus cho video và audio
        videoBitsPerSecond: 10000000, // 10 Mbps - chất lượng rất cao
        audioBitsPerSecond: 192000, // 192 kbps cho audio chất lượng cao
      };

      // Fallback nếu VP9 không được hỗ trợ
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options.mimeType = 'video/webm;codecs=vp8';
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          options.mimeType = 'video/webm';
        }
      }

      // Kiểm tra stream có audio track không
      console.log('Combined stream tracks:', {
        video: combinedStream.getVideoTracks().length,
        audio: combinedStream.getAudioTracks().length,
        all: combinedStream.getTracks().length
      });
      
      const mediaRecorder = new MediaRecorder(combinedStream, options);
      mediaRecorderRef.current = mediaRecorder;
      recordedChunksRef.current = [];
      
      // Kiểm tra MediaRecorder có hỗ trợ audio không
      console.log('MediaRecorder mimeType:', options.mimeType);
      console.log('MediaRecorder state:', mediaRecorder.state);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        // Chỉ lưu nếu có dữ liệu (không phải cancel)
        if (recordedChunksRef.current.length > 0) {
          const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
          
          // Tạo tên file tự động dựa trên số lượng bóng và tốc độ
          const numBalls = ballSlider ? ballSlider.value() : 6;
          const speed = speedSlider ? speedSlider.value() : 5;
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
          const filename = `ballsPing_${numBalls}balls_speed${speed}_${timestamp}.webm`;

          // Tạo download link
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }

        // Cleanup
        if (canvasStreamRef.current) {
          canvasStreamRef.current.getTracks().forEach(track => track.stop());
          canvasStreamRef.current = null;
        }
        if (audioStreamRef.current) {
          audioStreamRef.current.getTracks().forEach(track => track.stop());
          audioStreamRef.current = null;
        }
        if (audioDestinationRef.current) {
          // Khôi phục kết nối osc về destination ban đầu
          const audioCtx = p5InstanceRef.current?.audioContext;
          if (osc && osc.output && audioDestinationRef.current.masterGain && audioCtx) {
            try {
              osc.output.disconnect();
              osc.output.connect(audioCtx.destination);
            } catch (e) {
              console.warn('Lỗi khi khôi phục audio connection:', e);
            }
          }
          // Disconnect masterGain
          if (audioDestinationRef.current.masterGain) {
            audioDestinationRef.current.masterGain.disconnect();
          }
          // Disconnect scriptProcessor nếu có
          if (audioDestinationRef.current.scriptProcessor) {
            audioDestinationRef.current.scriptProcessor.disconnect();
          }
          audioDestinationRef.current = null;
        }
        
        // Reset recorded chunks sau khi xử lý
        recordedChunksRef.current = [];
      };

      mediaRecorder.start(100); // Ghi mỗi 100ms để đảm bảo không mất dữ liệu
      
      // Cập nhật state ngay lập tức để UI hiển thị đúng
      isRecordingRef.current = true;
      setIsRecording(true);
      
      console.log('Recording đã bắt đầu, isRecording:', true);
    } catch (error) {
      console.error('Lỗi khi bắt đầu recording:', error);
      alert('Không thể bắt đầu recording. Vui lòng thử lại.');
      // Đảm bảo state được reset nếu có lỗi
      setIsRecording(false);
      isRecordingRef.current = false;
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecordingRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      isRecordingRef.current = false;
    }
  };

  const cancelRecording = () => {
    // Hủy recording hiện tại mà không lưu
    if (mediaRecorderRef.current && isRecordingRef.current) {
      // Clear recorded chunks trước để onstop không lưu file
      recordedChunksRef.current = [];
      
      try {
        // Stop recording - onstop sẽ không lưu vì chunks đã bị clear
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.warn('Lỗi khi hủy recording:', e);
      }
      
      // Cleanup streams
      if (canvasStreamRef.current) {
        canvasStreamRef.current.getTracks().forEach(track => track.stop());
        canvasStreamRef.current = null;
      }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop());
        audioStreamRef.current = null;
      }
      if (audioDestinationRef.current) {
        const audioCtx = p5InstanceRef.current?.audioContext;
        if (osc && osc.output && audioDestinationRef.current.masterGain && audioCtx) {
          try {
            osc.output.disconnect();
            osc.output.connect(audioCtx.destination);
          } catch (e) {
            // Ignore
          }
        }
        if (audioDestinationRef.current.masterGain) {
          audioDestinationRef.current.masterGain.disconnect();
        }
        if (audioDestinationRef.current.scriptProcessor) {
          audioDestinationRef.current.scriptProcessor.disconnect();
        }
        audioDestinationRef.current = null;
      }
      
      setIsRecording(false);
      isRecordingRef.current = false;
      mediaRecorderRef.current = null;
    }
  };

  const handleReset = async (p5Instance) => {
    // Nếu đang recording, hủy recording cũ
    if (isRecordingRef.current) {
      cancelRecording();
      // Đợi một chút để cleanup hoàn tất và state được cập nhật
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    // Reset game
    initGame(p5Instance);
    
    // Tự động bắt đầu recording mới sau khi reset
    // Không cần kiểm tra audioEnabled vì startRecording sẽ tự xử lý
    setTimeout(async () => {
      try {
        console.log('Tự động bắt đầu recording sau khi reset...');
        await startRecording();
        console.log('Recording đã bắt đầu thành công');
      } catch (error) {
        console.error('Lỗi khi tự động bắt đầu recording:', error);
        // Nếu lỗi do audio chưa enable, không hiển thị alert (để không làm phiền user)
        if (!error.message || !error.message.includes('audio')) {
          // Chỉ hiển thị alert cho các lỗi khác
        }
      }
    }, 300); // Đợi một chút để game khởi tạo xong
  };

  return (
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', flexDirection: 'column', alignItems: 'center' }}>
      <div ref={sketchRef} />
      
      {/* Recording Controls - Chỉ hiển thị khi đã bật audio */}
      {audioEnabled && (
        <div style={{ 
          marginTop: '10px', 
          display: 'flex', 
          gap: '10px',
          zIndex: 100
        }}>
          {!isRecording ? (
            <button
              onClick={startRecording}
              style={{
                padding: '10px 20px',
                fontSize: '16px',
                backgroundColor: '#e74c3c',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
                fontWeight: 'bold',
                boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
              }}
              onMouseOver={(e) => e.target.style.backgroundColor = '#c0392b'}
              onMouseOut={(e) => e.target.style.backgroundColor = '#e74c3c'}
            >
              🔴 Bắt đầu ghi hình
            </button>
          ) : (
          <button
            onClick={stopRecording}
            style={{
              padding: '10px 20px',
              fontSize: '16px',
              backgroundColor: '#27ae60',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontWeight: 'bold',
              boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
              animation: 'pulse 1.5s infinite',
            }}
            onMouseOver={(e) => e.target.style.backgroundColor = '#229954'}
            onMouseOut={(e) => e.target.style.backgroundColor = '#27ae60'}
          >
            ⏹️ Dừng & Tải xuống
          </button>
        )}
        {isRecording && (
          <div style={{
            padding: '10px 15px',
            fontSize: '14px',
            backgroundColor: 'rgba(231, 76, 60, 0.2)',
            color: '#e74c3c',
            borderRadius: '5px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <span style={{
              width: '10px',
              height: '10px',
              backgroundColor: '#e74c3c',
              borderRadius: '50%',
              display: 'inline-block',
              animation: 'blink 1s infinite',
            }}></span>
            Đang ghi...
          </div>
          )}
        </div>
      )}

      {!audioEnabled && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
            cursor: 'pointer',
          }}
          onClick={handleStartClick}
        >
          <div
            style={{
              textAlign: 'center',
              color: 'white',
              padding: '30px',
              backgroundColor: 'rgba(20, 20, 20, 0.9)',
              borderRadius: '10px',
              border: '2px solid rgba(255, 255, 255, 0.3)',
            }}
          >
            <h2 style={{ marginBottom: '20px', fontSize: '24px' }}>🎵 Click để bắt đầu</h2>
            <p style={{ fontSize: '16px', opacity: 0.8 }}>
              Nhấn vào đây để bật âm thanh và bắt đầu game
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
