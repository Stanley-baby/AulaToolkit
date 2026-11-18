typedef unsigned char u8;
typedef unsigned short u16;
typedef unsigned int u32;
#define B(a) (*(volatile u8 *)(a))
#define H(a) (*(volatile u16 *)(a))
#define W(a) (*(volatile u32 *)(a))
#define CALL(a) (((void (*)(void))((a) | 1))())
#define INLINE static __attribute__((always_inline)) inline
#define HOOK(name) __attribute__((used, noinline, section(".text." #name))) void name(void)
#define WIRED_DARK B(0x20007fe0)
#define WIRED_REMAIN W(0x20007fe4)
#define WIRED_KEY B(0x20007fe8)
#define LAST_MODE B(0x20007fe9)

INLINE u32 timeout(void) {
  u8 selector = B(0x200000fa);
  if (selector == 124) return B(0x9007) * 600;
  if (selector >= 128 && selector <= 247) return (selector - 127) * 600;
  if (selector >= 4 && selector <= 123) return (selector - 3) * 600;
  if (selector == 0) return 0;
  if (selector == 1) return 600;
  if (selector == 3) return 18000;
  return 3000;
}
INLINE void clear_lights(void) {
  for (u32 i = 0; i < 147 * 3; i++) H(0x20001838 + i * 2) = 0;
}
INLINE void restore(void) {
  WIRED_DARK = 0;
  CALL(0x7ed4);
  B(0x20000157) = 1;
  B(0x20000193) = 1;
}
INLINE int visible(void) {
  u8 mode = B(0x200000ea);
  if (LAST_MODE != mode) {
    if (WIRED_DARK) restore();
    LAST_MODE = mode;
    WIRED_REMAIN = timeout();
    WIRED_KEY = 0;
  }
  if (mode != 0) return 1;
  if (WIRED_KEY) {
    WIRED_KEY = 0;
    if (WIRED_DARK) restore();
  }
  return WIRED_DARK == 0;
}
HOOK(wired_init) {
  CALL(0x1b000);
  WIRED_DARK = 0;
  WIRED_KEY = 0;
  LAST_MODE = B(0x200000ea);
  WIRED_REMAIN = timeout();
}
HOOK(wired_reload) {
  CALL(0x1b800);
  WIRED_REMAIN = timeout();
  if (B(0x200000ea) == 0 && B(0x200000fa) == 0) WIRED_KEY = 1;
}
HOOK(wired_key) {
  CALL(0x46d0);
  if (B(0x200000ea) == 0) WIRED_KEY = 1;
}
HOOK(wired_main_light) {
  if (visible()) CALL(0x1b020);
}
HOOK(wired_side_light) {
  if (visible()) CALL(0x1b0a0);
}
HOOK(wired_screen) {
  if (visible()) CALL(0x1b0c0);
}
HOOK(wired_suspend) {
  clear_lights();
  WIRED_DARK = 1;
  WIRED_KEY = 0;
  CALL(0x7eaa);
}
HOOK(wired_usb_restore) {
  // A host USB wake is not evidence that its display or the user has woken.
  if (B(0x200000ea) != 0) {
    WIRED_DARK = 0;
    CALL(0x7ed4);
  }
}
HOOK(wired_idle) {
  visible();
  if (B(0x20000005) && B(0x200000fa) != 0) {
    if (B(0x200000a5) || B(0x200000a7) || B(0x20000048)) {
      WIRED_REMAIN = timeout();
    } else if (WIRED_REMAIN) {
      WIRED_REMAIN--;
      if (WIRED_REMAIN == 0 && !WIRED_DARK) {
        clear_lights();
        WIRED_DARK = 1;
        CALL(0x7eaa);
      }
    }
  }
  CALL(0x2ec);
}
