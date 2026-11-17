typedef unsigned char u8;
typedef unsigned int u32;
#define B(a) (*(volatile u8 *)(a))
#define W(a) (*(volatile u32 *)(a))

__attribute__((used, noinline, section(".text.reload")))
void reload(void) {
  u32 selector = B(0x200000fa);
  W(0x20007ff4) = 0;
  if (selector == 124 && B(0x9007) >= 1 && B(0x9007) < B(0x9009) && B(0x9009) <= 120) {
    W(0x20000110) = B(0x9009) * 600;
    W(0x20007ff4) = (B(0x9009) - B(0x9007)) * 600;
  } else if (selector >= 128 && selector <= 247) {
    W(0x20000110) = (selector - 127) * 600;
  } else if (selector >= 4 && selector <= 123) {
    W(0x20000110) = (selector - 3) * 600;
  } else if (selector == 1) {
    W(0x20000110) = 600;
  } else if (selector == 3) {
    W(0x20000110) = 18000;
  } else if (selector != 0) {
    W(0x20000110) = 3000;
    B(0x200000fa) = 2;
  }
  // Preserve the stock ten-second timeout while the radio is disconnected.
  if (B(0x200000f7) == 0) W(0x20000110) = 100;
}
