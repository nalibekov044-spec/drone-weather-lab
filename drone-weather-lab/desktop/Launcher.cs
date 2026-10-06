using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

[assembly: AssemblyTitle("Drone Weather Lab")]
[assembly: AssemblyVersion("0.85.0.0")]

internal static class Launcher
{
    [STAThread]
    private static int Main(string[] args)
    {
        try
        {
            bool extractOnly = args.Length == 2 && args[0] == "--extract-to";
            string folder = extractOnly ? Path.GetFullPath(args[1]) : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "DroneWeatherLab", "0.85-Beta");
            Directory.CreateDirectory(folder);
            string destination = Path.Combine(folder, "Drone-Weather-Lab-0.85-Beta.html");
            using (Stream resource = Assembly.GetExecutingAssembly().GetManifestResourceStream("Simulator"))
            {
                if (resource == null) throw new InvalidOperationException("The simulator file is missing.");
                using (FileStream output = File.Create(destination)) resource.CopyTo(output);
            }
            if (!extractOnly) Process.Start(new ProcessStartInfo(destination) { UseShellExecute = true });
            return 0;
        }
        catch (Exception error)
        {
            if (args.Length == 0) MessageBox.Show(error.Message, "Drone Weather Lab", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }
}
