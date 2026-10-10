using Dalamud.Configuration;

namespace Chatpendium;

[Serializable]
public sealed class Configuration : IPluginConfiguration
{
    public int Version { get; set; } = 1;
    public HashSet<string> Favorites { get; set; } = [];
}
