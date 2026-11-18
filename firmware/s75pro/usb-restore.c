typedef unsigned char u8;
typedef unsigned int u32;
#define B(a) (*(volatile u8 *)(a))
#define W(a) (*(volatile u32 *)(a))
#define CALL(a) (((void (*)(void))((a) | 1))())

__attribute__((used, noinline, section(".text.usb_restore")))
void usb_restore(void) {
  // Stock WFI return sets this latch after the resume IRQ has already cleared it.
  if ((W(0x4005c004) & 0x40000000) == 0) B(0x200000b8) = 0;
  if (B(0x200000ea) != 0) {
    B(0x20007fe0) = 0;
    CALL(0x7ed4);
  }
}
