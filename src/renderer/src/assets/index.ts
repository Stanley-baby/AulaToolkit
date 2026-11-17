// Official product renders from aulastar.com, used with the device models.
import s75pro from './devices/s75pro.png';
import s75pro2 from './devices/s75pro-2.png';
import sc900 from './devices/sc900.png';
import sc9002 from './devices/sc900-2.png';
import sc9003 from './devices/sc900-3.png';
import f75 from './devices/f75.png';
import s75proTop from './devices/s75pro-top.png';
import f75Top from './devices/f75-top.png';
import s75Smoked from './devices/s75pro-smoked.png';

export const IMAGES: Record<string, string> = {
  s75pro, 's75pro-2': s75pro2, sc900, 'sc900-2': sc9002, 'sc900-3': sc9003, f75, 's75pro-top': s75proTop, 'f75-top': f75Top,
};

export const imageFor = (id: string): string => IMAGES[id] ?? '';

// Align the approved high-resolution photo to the existing vendor key-coordinate space.
export const S75_SMOKED_PHOTO = {
  src: s75Smoked, x: 70, y: 3.5, width: 658, height: 279, translucent: true,
  // Normalized case silhouette excludes the pale photo backdrop, retaining the side LEDs and switch.
  outline: 'M.040 .028 H.960 C.976 .028 .988 .058 .988 .092 V.134 H.990 V.210 H.988 V.925 C.988 .960 .976 .989 .959 .989 H.041 C.025 .989 .013 .960 .013 .925 V.095 C.013 .058 .025 .028 .040 .028 Z',
};
