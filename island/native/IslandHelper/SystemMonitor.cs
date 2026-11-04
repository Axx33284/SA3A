// Privacy indicators (camera / microphone in use) and fullscreen detection.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading;
using Microsoft.Win32;

namespace IslandHelper
{
    internal sealed class PrivacyMonitor
    {
        Timer _timer;
        string _last = "";

        public void Start() { _timer = new Timer(_ => Poll(), null, 500, 1500); }

        void Poll()
        {
            try
            {
                var mic = InUse("microphone");
                var cam = InUse("webcam");
                var key = string.Join(",", mic) + "|" + string.Join(",", cam);
                if (key == _last) return;
                _last = key;
                Program.Send(new Dictionary<string, object> { { "type", "privacy" }, { "mic", mic }, { "cam", cam } });
            }
            catch (Exception ex) { Program.Log("privacy: " + ex.Message); }
        }

        // Windows records start/stop times per app; an app with a start time and no stop time
        // is using the device right now. This is what drives the Windows tray privacy icon.
        static List<string> InUse(string capability)
        {
            var result = new List<string>();
            using (var root = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\" + capability))
            {
                if (root == null) return result;
                Scan(root, result, false);
                using (var np = root.OpenSubKey("NonPackaged")) if (np != null) Scan(np, result, true);
            }
            return result.Distinct().ToList();
        }

        static void Scan(RegistryKey key, List<string> result, bool nonPackaged)
        {
            foreach (var name in key.GetSubKeyNames())
            {
                if (name == "NonPackaged") continue;
                using (var k = key.OpenSubKey(name))
                {
                    if (k == null) continue;
                    var start = k.GetValue("LastUsedTimeStart");
                    var stop = k.GetValue("LastUsedTimeStop");
                    if (start == null || stop == null) continue;
                    if (Convert.ToInt64(start) > 0 && Convert.ToInt64(stop) == 0)
                    {
                        string display = nonPackaged ? name.Split('#').Last() : name.Split('_').First();
                        if (display.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) display = display.Substring(0, display.Length - 4);
                        if (display.IndexOf("WinIsland", StringComparison.OrdinalIgnoreCase) >= 0) continue;
                        result.Add(display);
                    }
                }
            }
        }
    }

    internal sealed class SystemMonitor
    {
        [DllImport("shell32.dll")] static extern int SHQueryUserNotificationState(out int state);
        [DllImport("kernel32.dll")] static extern bool GetSystemPowerStatus(out SYSTEM_POWER_STATUS s);
        [StructLayout(LayoutKind.Sequential)]
        struct SYSTEM_POWER_STATUS { public byte ACLineStatus, BatteryFlag, BatteryLifePercent, SystemStatusFlag; public int BatteryLifeTime, BatteryFullLifeTime; }

        public bool Fullscreen;
        Timer _timer, _power;
        bool _sent;
        string _lastPower = "";

        public void Start()
        {
            _timer = new Timer(_ => Poll(), null, 0, 1000);
            _power = new Timer(_ => PollPower(), null, 0, 2000);
        }

        void PollPower()
        {
            try
            {
                SYSTEM_POWER_STATUS s;
                if (!GetSystemPowerStatus(out s)) return;
                bool hasBattery = (s.BatteryFlag & 128) == 0 && s.BatteryLifePercent != 255;
                bool ac = s.ACLineStatus == 1;
                bool charging = ac && (s.BatteryFlag & 8) != 0;
                int pct = s.BatteryLifePercent == 255 ? -1 : s.BatteryLifePercent;
                bool saver = s.SystemStatusFlag == 1;
                var key = hasBattery + "|" + ac + "|" + charging + "|" + pct + "|" + saver;
                if (key == _lastPower) return;
                _lastPower = key;
                Program.Send(new Dictionary<string, object> {
                    { "type", "power" }, { "hasBattery", hasBattery }, { "ac", ac }, { "charging", charging },
                    { "percent", pct }, { "saver", saver }, { "minutesLeft", s.BatteryLifeTime > 0 ? s.BatteryLifeTime / 60 : -1 }
                });
            }
            catch (Exception ex) { Program.Log("power: " + ex.Message); }
        }

        void Poll()
        {
            try
            {
                int st;
                if (SHQueryUserNotificationState(out st) != 0) return;
                // QUNS_BUSY (fullscreen app), QUNS_RUNNING_D3D_FULL_SCREEN (game), QUNS_PRESENTATION_MODE
                bool fs = st == 2 || st == 3 || st == 4;
                if (fs == Fullscreen && _sent) return;
                Fullscreen = fs; _sent = true;
                Program.Send(new Dictionary<string, object> { { "type", "fullscreen" }, { "value", fs }, { "state", st } });
            }
            catch (Exception ex) { Program.Log("fullscreen: " + ex.Message); }
        }
    }
}
