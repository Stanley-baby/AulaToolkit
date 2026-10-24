# Prints `off` / `on` when the monitor turns off or on. Electron has no event for this.
Add-Type -AssemblyName System.Windows.Forms

Add-Type -ReferencedAssemblies System.Windows.Forms @'
using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public sealed class AulaDisplayPowerWatcher : Form
{
    private const int WM_POWERBROADCAST = 0x0218;
    private const int PBT_POWERSETTINGCHANGE = 0x8013;
    private static readonly Guid ConsoleDisplayState = new Guid("6FE69556-704A-47A0-8F24-C28D936FDA47");

    [StructLayout(LayoutKind.Sequential)]
    private struct PowerBroadcastSetting
    {
        public Guid PowerSetting;
        public uint DataLength;
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr RegisterPowerSettingNotification(IntPtr recipient, ref Guid settingGuid, int flags);

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        var setting = ConsoleDisplayState;
        RegisterPowerSettingNotification(Handle, ref setting, 0);
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == WM_POWERBROADCAST && m.WParam.ToInt64() == PBT_POWERSETTINGCHANGE)
        {
            var setting = (PowerBroadcastSetting)Marshal.PtrToStructure(m.LParam, typeof(PowerBroadcastSetting));
            if (setting.PowerSetting == ConsoleDisplayState && setting.DataLength >= 4)
            {
                // 0 = off, 1 = on, 2 = dimmed (still visible, so on)
                var state = Marshal.ReadInt32(m.LParam, Marshal.SizeOf(typeof(PowerBroadcastSetting)));
                Console.WriteLine(state == 0 ? "off" : "on");
                Console.Out.Flush();
            }
        }
        base.WndProc(ref m);
    }

    public static void Run()
    {
        Application.EnableVisualStyles();
        using (var form = new AulaDisplayPowerWatcher())
        {
            form.ShowInTaskbar = false;
            form.Opacity = 0;
            form.WindowState = FormWindowState.Minimized;
            form.Show();
            Application.Run(form);
        }
    }
}
'@

[AulaDisplayPowerWatcher]::Run()
