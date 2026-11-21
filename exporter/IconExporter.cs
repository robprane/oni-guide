using System;
using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json;
using UnityEngine;

namespace OniGuideExporter
{
    public class IconExportReport
    {
        [JsonProperty("exported")] public int Exported { get; set; }
        [JsonProperty("skippedExisting")] public int SkippedExisting { get; set; }
        [JsonProperty("failed")] public Dictionary<string, string> Failed { get; set; } = new Dictionary<string, string>();
    }

    public static class IconExporter
    {
        private static readonly string[] FallbackAnimNames = new[]
        {
            "ui", "place", "object", "idle", "idle_loop", "off", "on", "closed", "working_loop", "grow_pst"
        };

        private static bool IsUnknownSprite(Sprite s)
        {
            if (s == null || s.texture == null) return true;
            string n = s.name ?? string.Empty;
            return n == "unknown" || n == "unknown_far" || n.StartsWith("unknown:");
        }

        private static Tuple<Sprite, Color> TryFindRadboltSprite()
        {
            string[] candidates = new[]
            {
                "radbolt", "ui_radbolt", "ui_radbolts", "icon_radbolt", "icon_radbolts",
                "status_item_radbolts", "overlay_radiation"
            };
            foreach (var c in candidates)
            {
                var sp = Assets.GetSprite(c);
                if (!IsUnknownSprite(sp))
                {
                    return new Tuple<Sprite, Color>(sp, Color.white);
                }
            }
            if (Assets.Sprites != null)
            {
                foreach (var kv in Assets.Sprites)
                {
                    var sp = kv.Value;
                    if (sp != null && !string.IsNullOrEmpty(sp.name) &&
                        sp.name.IndexOf("radbolt", StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        return new Tuple<Sprite, Color>(sp, Color.white);
                    }
                }
            }
            var anim = Assets.GetAnim("spark_radial_high_energy_particles_kanim");
            if (anim != null)
            {
                var sp = TryExtractAnySymbolFromAnim(anim);
                if (!IsUnknownSprite(sp)) return new Tuple<Sprite, Color>(sp, Color.white);
            }
            return null;
        }

        private static Sprite TryExtractAnySymbolFromAnim(KAnimFile anim)
        {
            if (anim == null) return null;
            try
            {
                var data = anim.GetData();
                var build = data?.build;
                if (build == null || build.symbols == null || build.symbols.Length == 0) return null;

                // Try preferred symbol names first
                string[] preferred = new[] { "ui", "place", "object", "body", "head", "base", "meter", "frame" };
                foreach (var p in preferred)
                {
                    var sym = build.GetSymbol(new KAnimHashedString(p));
                    if (sym != null && sym.numFrames > 0)
                    {
                        var sp = Def.GetSpriteFromKAnimFile(anim, data, build, null, p, false, p);
                        if (!IsUnknownSprite(sp)) return sp;
                    }
                }

                // Fallback: pick largest-area non-empty symbol in the build
                Sprite best = null;
                float bestArea = 0f;
                for (int i = 0; i < build.symbols.Length; i++)
                {
                    var sym = build.symbols[i];
                    if (sym == null || sym.numFrames <= 0) continue;
                    var frame = sym.GetFrame(0);
                    Texture2D tex = build.GetTexture(0);
                    if (tex == null) continue;
                    int w = (int)(tex.width * Mathf.Abs(frame.uvMax.x - frame.uvMin.x));
                    int h = (int)(tex.height * Mathf.Abs(frame.uvMin.y - frame.uvMax.y));
                    float area = w * h;
                    if (area > bestArea && w >= 8 && h >= 8)
                    {
                        Rect rect = new Rect(
                            (int)(tex.width * Mathf.Min(frame.uvMin.x, frame.uvMax.x)),
                            (int)(tex.height * Mathf.Min(frame.uvMin.y, frame.uvMax.y)),
                            w,
                            h
                        );
                        if (rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= tex.width && rect.y + rect.height <= tex.height)
                        {
                            bestArea = area;
                            best = Sprite.Create(tex, rect, new Vector2(0.5f, 0.5f), 100f, 0u, SpriteMeshType.FullRect);
                        }
                    }
                }
                return best;
            }
            catch
            {
                return null;
            }
        }

        private static Tuple<Sprite, Color> ResolveSprite(string gameId)
        {
            if (gameId == "HighEnergyParticle")
            {
                return TryFindRadboltSprite();
            }

            Tag tag = new Tag(gameId);

            // 1. Elements (Solid / Liquid / Gas)
            var el = ElementLoader.GetElement(tag);
            if (el != null)
            {
                var tup = Def.GetUISprite(el);
                if (tup != null && !IsUnknownSprite(tup.first)) return tup;
            }

            // 2. BuildingDefs
            var bDef = Assets.GetBuildingDef(gameId);
            if (bDef != null)
            {
                var sp = bDef.GetUISprite("ui", false);
                if (!IsUnknownSprite(sp)) return new Tuple<Sprite, Color>(sp, Color.white);
                sp = bDef.GetUISprite("place", false);
                if (!IsUnknownSprite(sp)) return new Tuple<Sprite, Color>(sp, Color.white);
                if (bDef.AnimFiles != null && bDef.AnimFiles.Length > 0)
                {
                    sp = TryExtractAnySymbolFromAnim(bDef.AnimFiles[0]);
                    if (!IsUnknownSprite(sp)) return new Tuple<Sprite, Color>(sp, Color.white);
                }
            }

            // 3. Prefabs (Critters, Eggs, Plants, Seeds, Foods, Geysers, Artifacts, Items)
            var prefab = Assets.TryGetPrefab(tag);
            if (prefab != null)
            {
                var tup = Def.GetUISprite(prefab);
                if (tup != null && !IsUnknownSprite(tup.first)) return tup;

                foreach (var animName in FallbackAnimNames)
                {
                    tup = Def.GetUISprite(prefab, animName);
                    if (tup != null && !IsUnknownSprite(tup.first)) return tup;
                }

                var kbac = prefab.GetComponent<KBatchedAnimController>();
                if (kbac != null && kbac.AnimFiles != null && kbac.AnimFiles.Length > 0)
                {
                    var sp = TryExtractAnySymbolFromAnim(kbac.AnimFiles[0]);
                    if (!IsUnknownSprite(sp)) return new Tuple<Sprite, Color>(sp, Color.white);
                }
            }

            // 4. Direct sprite lookup
            var direct = Assets.GetSprite(gameId);
            if (!IsUnknownSprite(direct)) return new Tuple<Sprite, Color>(direct, Color.white);

            return null;
        }

        private static Texture2D GetOrCreateReadableTexture(Texture2D source, Dictionary<Texture2D, Texture2D> cache)
        {
            if (cache.TryGetValue(source, out var cached)) return cached;

            RenderTexture rt = RenderTexture.GetTemporary(
                source.width,
                source.height,
                0,
                RenderTextureFormat.ARGB32,
                RenderTextureReadWrite.sRGB
            );
            RenderTexture prev = RenderTexture.active;
            try
            {
                Graphics.Blit(source, rt);
                RenderTexture.active = rt;
                Texture2D readable = new Texture2D(source.width, source.height, TextureFormat.RGBA32, false);
                readable.ReadPixels(new Rect(0, 0, source.width, source.height), 0, 0);
                readable.Apply(false, false);
                cache[source] = readable;
                return readable;
            }
            finally
            {
                RenderTexture.active = prev;
                RenderTexture.ReleaseTemporary(rt);
            }
        }

        private static byte[] RenderSpriteToPng(Sprite sprite, Color tint, Dictionary<Texture2D, Texture2D> readableCache)
        {
            Texture2D readable = GetOrCreateReadableTexture(sprite.texture, readableCache);
            Rect r = sprite.packed ? sprite.textureRect : sprite.rect;

            int rx = Mathf.Clamp(Mathf.RoundToInt(r.x), 0, readable.width - 1);
            int ry = Mathf.Clamp(Mathf.RoundToInt(r.y), 0, readable.height - 1);
            int rw = Mathf.Clamp(Mathf.RoundToInt(r.width), 1, readable.width - rx);
            int rh = Mathf.Clamp(Mathf.RoundToInt(r.height), 1, readable.height - ry);

            Color[] pixels = readable.GetPixels(rx, ry, rw, rh);

            bool applyTint = tint.a > 0.01f &&
                (Mathf.Abs(tint.r - 1f) > 0.005f || Mathf.Abs(tint.g - 1f) > 0.005f || Mathf.Abs(tint.b - 1f) > 0.005f || Mathf.Abs(tint.a - 1f) > 0.005f);

            int minX = rw, minY = rh, maxX = -1, maxY = -1;
            for (int y = 0; y < rh; y++)
            {
                int rowOffset = y * rw;
                for (int x = 0; x < rw; x++)
                {
                    Color c = pixels[rowOffset + x];
                    if (applyTint)
                    {
                        c.r *= tint.r;
                        c.g *= tint.g;
                        c.b *= tint.b;
                        c.a *= tint.a;
                        pixels[rowOffset + x] = c;
                    }
                    if (c.a > 0.02f)
                    {
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                    }
                }
            }

            // If fully transparent, bail out
            if (maxX < minX || maxY < minY) return null;

            const int pad = 2;
            int outW = (maxX - minX + 1) + pad * 2;
            int outH = (maxY - minY + 1) + pad * 2;
            Color[] cropped = new Color[outW * outH];
            for (int y = minY; y <= maxY; y++)
            {
                int dstY = (y - minY) + pad;
                int srcRow = y * rw;
                int dstRow = dstY * outW;
                for (int x = minX; x <= maxX; x++)
                {
                    int dstX = (x - minX) + pad;
                    cropped[dstRow + dstX] = pixels[srcRow + x];
                }
            }

            Texture2D outTex = new Texture2D(outW, outH, TextureFormat.RGBA32, false);
            try
            {
                outTex.SetPixels(cropped);
                outTex.Apply(false, false);
                return ImageConversion.EncodeToPNG(outTex);
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(outTex);
            }
        }

        public static IconExportReport ExportMissingIcons(string manifestPath, string iconsOutputDir, string reportPath)
        {
            var report = new IconExportReport();
            if (string.IsNullOrWhiteSpace(manifestPath) || !File.Exists(manifestPath) || string.IsNullOrWhiteSpace(iconsOutputDir))
            {
                Debug.Log($"[OniGuideExporter] Icon export skipped (manifest not found at '{manifestPath}')");
                return report;
            }

            if (!Directory.Exists(iconsOutputDir))
            {
                Directory.CreateDirectory(iconsOutputDir);
            }

            var manifest = JsonConvert.DeserializeObject<Dictionary<string, string>>(File.ReadAllText(manifestPath));
            if (manifest == null || manifest.Count == 0) return report;

            var readableCache = new Dictionary<Texture2D, Texture2D>();
            try
            {
                foreach (var kv in manifest)
                {
                    string gameId = kv.Key;
                    string fileName = kv.Value;
                    if (string.IsNullOrWhiteSpace(gameId) || string.IsNullOrWhiteSpace(fileName)) continue;

                    string destPath = Path.Combine(iconsOutputDir, fileName);
                    if (File.Exists(destPath))
                    {
                        report.SkippedExisting++;
                        continue;
                    }

                    try
                    {
                        var resolved = ResolveSprite(gameId);
                        if (resolved == null || IsUnknownSprite(resolved.first))
                        {
                            report.Failed[gameId] = "Sprite not found or unknown";
                            continue;
                        }

                        byte[] png = RenderSpriteToPng(resolved.first, resolved.second, readableCache);
                        if (png == null || png.Length == 0)
                        {
                            report.Failed[gameId] = "Empty transparent sprite";
                            continue;
                        }

                        File.WriteAllBytes(destPath, png);
                        report.Exported++;
                    }
                    catch (Exception ex)
                    {
                        report.Failed[gameId] = ex.Message;
                    }
                }
            }
            finally
            {
                foreach (var tex in readableCache.Values)
                {
                    if (tex != null) UnityEngine.Object.DestroyImmediate(tex);
                }
                readableCache.Clear();
            }

            if (!string.IsNullOrWhiteSpace(reportPath))
            {
                string rDir = Path.GetDirectoryName(reportPath);
                if (!string.IsNullOrEmpty(rDir) && !Directory.Exists(rDir)) Directory.CreateDirectory(rDir);
                File.WriteAllText(reportPath, JsonConvert.SerializeObject(report, Formatting.Indented));
            }

            Debug.Log(
                $"[OniGuideExporter] Icon export complete -> {iconsOutputDir} " +
                $"(exported={report.Exported}, skippedExisting={report.SkippedExisting}, failed={report.Failed.Count})"
            );
            return report;
        }
    }
}
