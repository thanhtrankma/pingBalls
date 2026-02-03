/**
 * Danh sách các game - thêm game mới vào đây để hiển thị trên trang chủ
 */
export const games = [
  {
    id: 'balls-ping',
    path: '/balls-ping',
    title: 'Ping Balls',
    description: 'Bóng va chạm trong vòng tròn, ghi hình và âm thanh.',
    icon: '⚽',
    color: '#e74c3c',
    gradient: 'linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)',
  },
  {
    id: 'circle-gap-balls',
    path: '/circle-gap-balls',
    title: 'Vòng tròn khuyết',
    description: 'Vòng tròn xoay khuyết 1/7, bóng rơi từ tâm, nền lá cờ.',
    icon: '🎯',
    color: '#c0392b',
    gradient: 'linear-gradient(135deg, #c0392b 0%, #922b21 100%)',
  },
  // Thêm game mới theo mẫu:
  // {
  //   id: 'ten-game',
  //   path: '/ten-game',
  //   title: 'Tên Game',
  //   description: 'Mô tả ngắn.',
  //   icon: '🎮',
  //   color: '#3498db',
  //   gradient: 'linear-gradient(135deg, #3498db 0%, #2980b9 100%)',
  // },
];
