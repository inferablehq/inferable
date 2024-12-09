using Inferable;

public static class Register
{
    public static void RegisterFunctions(InferableClient client)
    {
        client.Default.RegisterFunction(new FunctionRegistration<ExecInput> {
            Name = "exec",
            Description = "Executes a system command (only 'ls' and 'cat' are allowed)",
            Func = new Func<ExecInput, object?>(ExecService.Exec),
        });
    }
}
