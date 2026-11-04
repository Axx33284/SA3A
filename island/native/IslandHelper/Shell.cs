// App names, opening apps and focusing windows.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading;

namespace IslandHelper
{
    internal static class AppNames
    {
        static readonly object Lock = new object();
        static Dictionary<string, string> _map;
        static DateTime _loaded = DateTime.MinValue;

        // Resolves an AppUserModelID to the name shown in the Start menu,
        // using the shell:AppsFolder virtual folder (covers Win32 and Store apps).
        public static string Get(string aumid)
        {
            if (string.IsNullOrEmpty(aumid)) return "";
            lock (Lock)
            {
                string name;
                if (_map != null && _map.TryGetValue(aumid, out name)) return name;
                if (_map == null || (DateTime.UtcNow - _loaded).TotalSeconds > 60)
                {
                    _map = Load();
                    _loaded = DateTime.UtcNow;
                    if (_map.TryGetValue(aumid, out name)) return name;
                }
            }
            try { return Windows.ApplicationModel.AppInfo.GetFromAppUserModelId(aumid).DisplayInfo.DisplayName; } catch { }
            return "";
        }

        static Dictionary<string, string> Load()
        {
            var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            var t = new Thread(() =>
            {
                try
                {
                    var type = Type.GetTypeFromProgID("Shell.Application");
                    var shell = Activator.CreateInstance(type);
                    var folder = type.InvokeMember("NameSpace", System.Reflection.BindingFlags.InvokeMethod, null, shell, new object[] { "shell:AppsFolder" });
                    var items = folder.GetType().InvokeMember("Items", System.Reflection.BindingFlags.InvokeMethod, null, folder, null);
                    foreach (var item in (System.Collections.IEnumerable)items)
                    {
                        try
                        {
                            var it = item.GetType();
                            var name = (string)it.InvokeMember("Name", System.Reflection.BindingFlags.GetProperty, null, item, null);
                            var path = (string)it.InvokeMember("Path", System.Reflection.BindingFlags.GetProperty, null, item, null);
                            if (!string.IsNullOrEmpty(path) && !map.ContainsKey(path)) map[path] = name;
                        }
                        catch { }
                    }
                }
                catch (Exception ex) { Program.Log("apps folder: " + ex.Message); }
            });
            t.SetApartmentState(ApartmentState.STA);
            t.IsBackground = true;
            t.Start();
            t.Join(8000);
            return map;
        }
    }

    internal static class Launcher
    {
        [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
        [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
        [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
        [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);

        // Opens an app by its AppUserModelID (what notifications and media sessions report).
        public static void Open(string aumid)
        {
            if (string.IsNullOrEmpty(aumid)) return;
            if (Focus(aumid)) return;
            try { Process.Start(new ProcessStartInfo("explorer.exe", "shell:AppsFolder\\" + aumid) { UseShellExecute = true }); }
            catch (Exception ex) { Program.Log("open: " + ex.Message); }
        }

        static string[] ProcessNames(string aumid)
        {
            var a = aumid.ToLowerInvariant();
            if (a.StartsWith("chrome")) return new[] { "chrome" };
            if (a.StartsWith("msedge") || a.Contains("microsoftedge")) return new[] { "msedge" };
            if (a == "308046b0af4a39cb" || a.Contains("firefox")) return new[] { "firefox" };
            if (a.Contains("spotify")) return new[] { "Spotify" };
            if (a.Contains("opera")) return new[] { "opera" };
            if (a.Contains("brave")) return new[] { "brave" };
            if (a.Contains("vlc")) return new[] { "vlc" };
            if (a.Contains("zunemusic") || a.Contains("zunevideo")) return new[] { "Microsoft.Media.Player", "Video.UI" };
            var last = aumid.Split('\\').Last().Split('!').First();
            if (last.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) last = last.Substring(0, last.Length - 4);
            return new[] { last };
        }

        public static bool Focus(string aumid)
        {
            if (string.IsNullOrEmpty(aumid)) return false;
            foreach (var name in ProcessNames(aumid))
            {
                Process[] procs;
                try { procs = Process.GetProcessesByName(name); } catch { continue; }
                foreach (var p in procs)
                {
                    try
                    {
                        var h = p.MainWindowHandle;
                        if (h == IntPtr.Zero) continue;
                        if (IsIconic(h)) ShowWindow(h, 9); // SW_RESTORE
                        // Windows only lets the foreground process change the foreground window;
                        // a synthetic Alt press lifts that lock for this call.
                        keybd_event(0x12, 0, 0, UIntPtr.Zero);
                        keybd_event(0x12, 0, 2, UIntPtr.Zero);
                        SetForegroundWindow(h);
                        return true;
                    }
                    catch { }
                }
            }
            return false;
        }
    }
}
