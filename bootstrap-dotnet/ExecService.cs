using System;
using System.Diagnostics;
using System.Collections.Generic;
using System.Threading.Tasks;

public static class ExecService
{
    private static readonly HashSet<string> AllowedCommands = new HashSet<string>
    {
        "ls",
        "cat"
    };

    public static ExecResponse Exec(ExecInput input)
    {
        try
        {
            if (!AllowedCommands.Contains(input.Command))
            {
                return new ExecResponse
                {
                    Error = $"Command '{input.Command}' is not allowed. Only 'ls' and 'cat' are permitted."
                };
            }

            if (!input.Arg.StartsWith("./"))
            {
                return new ExecResponse
                {
                    Error = "Can only access paths starting with ./"
                };
            }

            var startInfo = new ProcessStartInfo
            {
                FileName = input.Command,
                Arguments = input.Arg,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using var process = Process.Start(startInfo);
            var stdout = process?.StandardOutput.ReadToEnd().Trim();
            var stderr = process?.StandardError.ReadToEnd().Trim();
            process?.WaitForExit();

            return new ExecResponse
            {
                Stdout = stdout,
                Stderr = stderr
            };
        }
        catch (Exception ex)
        {
            return new ExecResponse
            {
                Error = ex.Message
            };
        }
    }
}

public struct ExecInput
{
    public required string Command { get; set; }
    public required string Arg { get; set; }
}

public class ExecResponse
{
    public string? Stdout { get; set; }
    public string? Stderr { get; set; }
    public string? Error { get; set; }
}
