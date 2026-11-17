typedef unsigned char u8;
typedef unsigned short u16;
typedef unsigned int u32;
#define B(a) (*(volatile u8 *)(a))
#define H(a) (*(volatile u16 *)(a))
#define W(a) (*(volatile u32 *)(a))
#define CALL(a) (((void (*)(void))((a) | 1))())
#define DARK B(0x20007ff0)
#define DARK_REMAINING W(0x20007ff4)
#define INLINE static __attribute__((always_inline)) inline
#define HOOK(name) __attribute__((used, noinline, section(".text." #name))) void name(void)

INLINE int fast_wake(void) {
  u8 selector = B(0x200000fa);
  return (selector >= 128 && selector <= 247) || selector == 124;
}
INLINE int active(void) {
  return !fast_wake() || (B(0x200000ea) != 1 && B(0x200000ea) != 2) || B(0x200000f7) == 0 ||
    B(0x200000fa) == 0 || W(0x20000110) > DARK_REMAINING || B(0x2000011c) != 0;
}
INLINE void wake(void) {
  if (DARK == 1 && active()) {
    DARK = 0;
    CALL(0x7ed4);
    B(0x20000157) = 1;
    B(0x20000193) = 1;
  }
}
HOOK(hook_init) {
  CALL(0xb086);
  DARK = 0;
}
HOOK(hook_main_light) {
  wake();
  if (DARK != 1) CALL(0xdbb0);
}
HOOK(hook_side_light) {
  if (DARK != 1) CALL(0xe504);
}
HOOK(hook_screen) {
  wake();
  if (DARK != 1) CALL(0x104e0);
}
HOOK(hook_idle) {
  wake();
  if (!fast_wake() || (B(0x200000ea) != 1 && B(0x200000ea) != 2) || B(0x200000f7) == 0 || B(0x2000011c) != 0 ||
      (B(0x200000fa) == 124 && W(0x20000110) <= 6)) {
    // Let the original routine send its radio sleep request before shutting down.
    CALL(0x194);
    return;
  }
  if (B(0x20000005) != 0) {
    B(0x20000005) = 0;
    if (B(0x200000fb) != 0) {
      B(0x200000fb)--;
      if (B(0x200000fb) == 0) {
        B(0x20000064) = 1;
        B(0x20000089) = 0xa6;
        B(0x2000008a) = 0xff;
        B(0x2000008b) = 1;
      }
    }
    if (W(0x20000110) != 0 && B(0x200000ec) == 0 &&
        B(0x200000fa) != 0 && B(0x200000a5) == 0 && B(0x200000a7) == 0) {
      W(0x20000110)--;
      // Keep the radio running: omit stock BT 0x55 and 2.4G A6 FE 02 sleep requests.
    }
  }
  if (W(0x20000110) <= DARK_REMAINING && B(0x200000fa) != 0) {
    if (DARK != 1) {
      DARK = 1;
      for (u32 i = 0; i < 147 * 3; i++) H(0x20001838 + i * 2) = 0;
      CALL(0x7eaa);
    }
    // Retain SysTick, key scan, UART and peripheral clocks during light sleep.
    W(0x40032040) = 4;
    __asm__ volatile("dsb\n\twfi\n\tisb" ::: "memory");
    W(0x40032040) = 0;
  }
}
