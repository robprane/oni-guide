using System;
using System.IO;
using HarmonyLib;
using KMod;
using Newtonsoft.Json;
using UnityEngine;

namespace OniGuideExporter
{
    public class ExporterConfig
    {
        [JsonProperty("outputPath")]
        public string OutputPath { get; set; }

        [JsonProperty("iconManifestPath")]
        public string IconManifestPath { get; set; }

        [JsonProperty("iconsOutputDir")]
        public string IconsOutputDir { get; set; }

        [JsonProperty("iconReportPath")]
        public string IconReportPath { get; set; }
    }

    public class OniGuideExporterMod : UserMod2
    {
        internal static string ModDir { get; private set; }
        internal static bool HasExported { get; set; }

        public override void OnLoad(Harmony harmony)
        {
            ModDir = path;
            Debug.Log($"[OniGuideExporter] Loaded from {ModDir}");
            base.OnLoad(harmony);
        }

        internal static ExporterConfig LoadConfig()
        {
            try
            {
                string configPath = Path.Combine(ModDir ?? string.Empty, "exporter_config.json");
                if (File.Exists(configPath))
                {
                    var cfg = JsonConvert.DeserializeObject<ExporterConfig>(File.ReadAllText(configPath));
                    if (cfg != null) return cfg;
                }
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[OniGuideExporter] Failed to read exporter_config.json: {ex}");
            }

            return new ExporterConfig
            {
                OutputPath = Path.Combine(ModDir ?? Application.persistentDataPath, "raw_export.json")
            };
        }

        internal static void RunExportOnce()
        {
            if (HasExported) return;
            HasExported = true;

            try
            {
                var cfg = LoadConfig();
                Debug.Log("[OniGuideExporter] Starting full game data export...");
                var data = DataCollector.CollectAll();
                string outPath = !string.IsNullOrWhiteSpace(cfg.OutputPath)
                    ? cfg.OutputPath
                    : Path.Combine(ModDir ?? Application.persistentDataPath, "raw_export.json");
                string dir = Path.GetDirectoryName(outPath);
                if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                {
                    Directory.CreateDirectory(dir);
                }

                string json = JsonConvert.SerializeObject(data, Formatting.Indented, new JsonSerializerSettings
                {
                    NullValueHandling = NullValueHandling.Ignore
                });
                File.WriteAllText(outPath, json);

                Debug.Log(
                    $"[OniGuideExporter] Export complete -> {outPath} " +
                    $"(elements={data.Elements.Count}, foods={data.Foods.Count}, buildings={data.Buildings.Count}, " +
                    $"recipesPre={data.ComplexRecipesPreProcess.Count}, recipesExp={data.ComplexRecipesExpanded.Count}, " +
                    $"critters={data.Critters.Count}, eggs={data.Eggs.Count}, plants={data.Plants.Count}, " +
                    $"seeds={data.Seeds.Count}, geysers={data.Geysers.Count}, items={data.Items.Count}, " +
                    $"tags={data.Tags.Count}, errors={data.Meta.Errors.Count})"
                );

                // Export any missing PNG icons listed in icon_manifest.json directly from Def.GetUISprite
                if (!string.IsNullOrWhiteSpace(cfg.IconManifestPath) && !string.IsNullOrWhiteSpace(cfg.IconsOutputDir))
                {
                    IconExporter.ExportMissingIcons(cfg.IconManifestPath, cfg.IconsOutputDir, cfg.IconReportPath);
                }
            }
            catch (Exception ex)
            {
                Debug.LogError($"[OniGuideExporter] Export failed: {ex}");
            }
        }
    }

    [HarmonyPatch(typeof(MainMenu), "OnSpawn")]
    internal static class MainMenu_OnSpawn_Patch
    {
        private static void Postfix()
        {
            OniGuideExporterMod.RunExportOnce();
        }
    }
}
