using System.Net.Http;
using System.Text.Json;
using Dalamud.Plugin.Services;

namespace Chatpendium;

internal sealed class CatalogStore : IDisposable
{
    internal const string CatalogUrl = "https://studium.yycholla.com/api/chatpendium/v1/catalog.json";
    private const int MaxCatalogBytes = 900_000;
    private readonly NativeCore core;
    private readonly IPluginLog log;
    private readonly string cachePath;
    private readonly CancellationTokenSource cancellation = new();
    private readonly HttpClient http = new(new HttpClientHandler { AllowAutoRedirect = false, UseCookies = false })
    { Timeout = TimeSpan.FromSeconds(15) };
    private Task<Download>? pending;
    private sealed record Download(string? Json, string? Error);

    internal JsonElement Catalog { get; private set; }
    internal int Revision { get; private set; }
    internal string Status { get; private set; } = "Bundled catalog";
    internal bool Refreshing => pending != null;

    internal CatalogStore(NativeCore core, string configDirectory, IPluginLog log)
    {
        this.core = core;
        this.log = log;
        cachePath = Path.Combine(configDirectory, "catalog-v1.json");
        Catalog = core.Call(new { op = "catalog" });
        try
        {
            if (File.Exists(cachePath))
            {
                if (new FileInfo(cachePath).Length > MaxCatalogBytes) throw new InvalidDataException("Cached catalog is too large.");
                Catalog = core.Validate(File.ReadAllText(cachePath));
                Status = "Cached catalog";
            }
        }
        catch (Exception ex)
        {
            log.Warning(ex, "Could not load the cached catalog; using the bundled catalog.");
            Status = "Bundled catalog · cached copy could not be loaded";
        }
        Refresh();
    }

    internal void Refresh()
    {
        if (pending != null) return;
        pending = DownloadAsync(cancellation.Token);
    }

    private async Task<Download> DownloadAsync(CancellationToken token)
    {
        try
        {
            using var response = await http.GetAsync(CatalogUrl, HttpCompletionOption.ResponseHeadersRead, token).ConfigureAwait(false);
            response.EnsureSuccessStatusCode();
            if (response.Content.Headers.ContentLength > MaxCatalogBytes) throw new InvalidDataException("Catalog is too large.");
            await using var stream = await response.Content.ReadAsStreamAsync(token).ConfigureAwait(false);
            using var buffer = new MemoryStream();
            var chunk = new byte[8192];
            int count;
            while ((count = await stream.ReadAsync(chunk, token).ConfigureAwait(false)) != 0)
            {
                if (buffer.Length + count > MaxCatalogBytes) throw new InvalidDataException("Catalog is too large.");
                buffer.Write(chunk, 0, count);
            }
            return new Download(System.Text.Encoding.UTF8.GetString(buffer.ToArray()), null);
        }
        catch (Exception ex)
        {
            // Return failures as data so unloading never leaves an unobserved faulted task.
            return new Download(null, ex.Message);
        }
    }

    // Called by the UI thread, never a download continuation.
    internal void Update()
    {
        if (pending is not { IsCompleted: true }) return;
        var download = pending.GetAwaiter().GetResult();
        pending = null;
        if (download.Json == null)
        {
            Status = "Offline · using the current catalog";
            log.Debug($"Catalog refresh unavailable: {download.Error}");
            return;
        }
        try
        {
            var validated = core.Validate(download.Json);
            Catalog = validated;
            Revision++;
            Status = "Catalog up to date";
        }
        catch (Exception ex)
        {
            Status = "Update rejected · using the current catalog";
            log.Warning(ex, "Downloaded catalog failed validation.");
            return;
        }
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(cachePath)!);
            var temporary = cachePath + ".tmp";
            File.WriteAllText(temporary, Catalog.GetRawText());
            File.Move(temporary, cachePath, overwrite: true);
        }
        catch (Exception ex)
        {
            Status = "Catalog updated · could not save offline copy";
            log.Warning(ex, "Could not save the catalog cache.");
        }
    }

    public void Dispose()
    {
        cancellation.Cancel();
        http.Dispose();
        cancellation.Dispose();
    }
}
