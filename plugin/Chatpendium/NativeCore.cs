using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;

namespace Chatpendium;

// All calls run on the Dalamud UI thread. Download tasks never touch native state.
internal sealed class NativeCore : IDisposable
{
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate uint AbiVersion();
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate nint Execute([In] byte[] input, nuint length);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate void Free(nint response);

    private nint library;
    private readonly Execute execute;
    private readonly Free free;
    internal static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    internal NativeCore(string pluginDirectory)
    {
        library = NativeLibrary.Load(Path.Combine(pluginDirectory, "chatpendium_native.dll"));
        try
        {
            var abi = Marshal.GetDelegateForFunctionPointer<AbiVersion>(NativeLibrary.GetExport(library, "chatpendium_abi_version"));
            if (abi() != 1) throw new InvalidOperationException("Chatpendium native library version does not match the plugin.");
            execute = Marshal.GetDelegateForFunctionPointer<Execute>(NativeLibrary.GetExport(library, "chatpendium_execute"));
            free = Marshal.GetDelegateForFunctionPointer<Free>(NativeLibrary.GetExport(library, "chatpendium_free"));
        }
        catch { NativeLibrary.Free(library); library = 0; throw; }
    }

    internal JsonElement Call(object request)
    {
        ObjectDisposedException.ThrowIf(library == 0, this);
        var bytes = JsonSerializer.SerializeToUtf8Bytes(request, JsonOptions);
        if (bytes.Length > 1_048_576) throw new InvalidOperationException("Catalog request is too large.");
        var response = execute(bytes, (nuint)bytes.Length);
        if (response == 0) throw new InvalidOperationException("The Rust catalog engine could not complete the request.");
        try
        {
            using var document = JsonDocument.Parse(Marshal.PtrToStringUTF8(response) ?? "null");
            var root = document.RootElement;
            if (!root.GetProperty("ok").GetBoolean())
                throw new InvalidOperationException(root.GetProperty("error").GetString());
            return root.GetProperty("data").Clone();
        }
        finally { free(response); }
    }

    internal JsonElement Validate(string json)
    {
        if (Encoding.UTF8.GetByteCount(json) > 900_000) throw new InvalidOperationException("Catalog is too large.");
        using var document = JsonDocument.Parse(json);
        return Call(new { op = "validate", catalog = document.RootElement });
    }

    public void Dispose()
    {
        if (library == 0) return;
        NativeLibrary.Free(library);
        library = 0;
    }
}

internal sealed record Entry(string Id, string Name, string Text, string Category, string Tags);
internal sealed record Category(string Id, string Name);
internal sealed record SearchResult(Entry[] Entries, Category[] Categories);
