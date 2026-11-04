// Volume HUD and audio-device switches (headphones / Bluetooth connected) through
// the Core Audio endpoint API.
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;

namespace IslandHelper
{
    internal sealed class AudioMonitor
    {
        IMMDeviceEnumerator _enum;
        IAudioEndpointVolume _vol;
        string _deviceId, _deviceName;
        float _level = -1; bool _muted;
        Thread _thread;
        readonly object _lock = new object();
        int _tick;

        public void Start()
        {
            _thread = new Thread(Loop) { IsBackground = true, Name = "audio" };
            _thread.SetApartmentState(ApartmentState.MTA);
            _thread.Start();
        }

        void Loop()
        {
            try { _enum = (IMMDeviceEnumerator)new MMDeviceEnumeratorComObject(); }
            catch (Exception ex) { Program.Log("audio: " + ex.Message); return; }
            while (true)
            {
                try
                {
                    if (_tick++ % 5 == 0 || _vol == null) CheckDevice();
                    if (_vol != null)
                    {
                        float level; bool muted;
                        lock (_lock)
                        {
                            Marshal.ThrowExceptionForHR(_vol.GetMasterVolumeLevelScalar(out level));
                            Marshal.ThrowExceptionForHR(_vol.GetMute(out muted));
                        }
                        if (Math.Abs(level - _level) > 0.004 || muted != _muted)
                        {
                            _level = level; _muted = muted;
                            Emit();
                        }
                    }
                }
                catch (Exception ex) { Program.Log("audio poll: " + ex.Message); lock (_lock) _vol = null; }
                Thread.Sleep(150);
            }
        }

        void CheckDevice()
        {
            IMMDevice dev;
            int hr = _enum.GetDefaultAudioEndpoint(0 /*eRender*/, 1 /*eMultimedia*/, out dev);
            if (hr != 0 || dev == null) { if (_deviceId != null) { _deviceId = null; _vol = null; Emit(); } return; }
            string id; dev.GetId(out id);
            if (id == _deviceId && _vol != null) return;
            var iid = typeof(IAudioEndpointVolume).GUID;
            object o;
            Marshal.ThrowExceptionForHR(dev.Activate(ref iid, 23 /*CLSCTX_ALL*/, IntPtr.Zero, out o));
            lock (_lock) _vol = (IAudioEndpointVolume)o;
            _deviceId = id;
            _deviceName = FriendlyName(dev);
            _level = -1; // force an emit with the new device
        }

        static string FriendlyName(IMMDevice dev)
        {
            try
            {
                IPropertyStore store;
                if (dev.OpenPropertyStore(0, out store) != 0) return "";
                var key = new PROPERTYKEY { fmtid = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"), pid = 14 };
                PROPVARIANT v;
                if (store.GetValue(ref key, out v) != 0) return "";
                string s = v.vt == 31 /*VT_LPWSTR*/ ? Marshal.PtrToStringUni(v.p) : "";
                PropVariantClear(ref v);
                return s ?? "";
            }
            catch { return ""; }
        }

        void Emit()
        {
            Program.Send(new Dictionary<string, object> {
                { "type", "volume" },
                { "level", _level < 0 ? 0 : Math.Round(_level, 3) },
                { "muted", _muted },
                { "deviceId", _deviceId },
                { "device", _deviceName ?? "" }
            });
        }

        public void SetVolume(float level)
        {
            try { var g = Guid.Empty; lock (_lock) _vol?.SetMasterVolumeLevelScalar(Math.Max(0, Math.Min(1, level)), ref g); }
            catch (Exception ex) { Program.Log("set volume: " + ex.Message); }
        }

        public void ToggleMute()
        {
            try { var g = Guid.Empty; lock (_lock) { if (_vol != null) { bool m; _vol.GetMute(out m); _vol.SetMute(!m, ref g); } } }
            catch (Exception ex) { Program.Log("mute: " + ex.Message); }
        }

        public object Summary() => new Dictionary<string, object> { { "device", _deviceName }, { "level", _level }, { "muted", _muted } };

        [DllImport("ole32.dll")] static extern int PropVariantClear(ref PROPVARIANT pvar);

        [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject { }

        [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IMMDeviceEnumerator
        {
            [PreserveSig] int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
            [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
            [PreserveSig] int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);
            [PreserveSig] int RegisterEndpointNotificationCallback(IntPtr client);
            [PreserveSig] int UnregisterEndpointNotificationCallback(IntPtr client);
        }

        [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IMMDevice
        {
            [PreserveSig] int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
            [PreserveSig] int OpenPropertyStore(int stgmAccess, out IPropertyStore properties);
            [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
            [PreserveSig] int GetState(out int state);
        }

        [ComImport, Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IPropertyStore
        {
            [PreserveSig] int GetCount(out int count);
            [PreserveSig] int GetAt(int index, out PROPERTYKEY key);
            [PreserveSig] int GetValue(ref PROPERTYKEY key, out PROPVARIANT value);
            [PreserveSig] int SetValue(ref PROPERTYKEY key, ref PROPVARIANT value);
            [PreserveSig] int Commit();
        }

        [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IAudioEndpointVolume
        {
            [PreserveSig] int RegisterControlChangeNotify(IntPtr notify);
            [PreserveSig] int UnregisterControlChangeNotify(IntPtr notify);
            [PreserveSig] int GetChannelCount(out uint count);
            [PreserveSig] int SetMasterVolumeLevel(float levelDb, ref Guid ctx);
            [PreserveSig] int SetMasterVolumeLevelScalar(float level, ref Guid ctx);
            [PreserveSig] int GetMasterVolumeLevel(out float levelDb);
            [PreserveSig] int GetMasterVolumeLevelScalar(out float level);
            [PreserveSig] int SetChannelVolumeLevel(uint channel, float levelDb, ref Guid ctx);
            [PreserveSig] int SetChannelVolumeLevelScalar(uint channel, float level, ref Guid ctx);
            [PreserveSig] int GetChannelVolumeLevel(uint channel, out float levelDb);
            [PreserveSig] int GetChannelVolumeLevelScalar(uint channel, out float level);
            [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx);
            [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
        }

        [StructLayout(LayoutKind.Sequential)]
        struct PROPERTYKEY { public Guid fmtid; public int pid; }

        [StructLayout(LayoutKind.Explicit)]
        struct PROPVARIANT
        {
            [FieldOffset(0)] public ushort vt;
            [FieldOffset(8)] public IntPtr p;
            [FieldOffset(16)] public IntPtr p2;
        }
    }
}
