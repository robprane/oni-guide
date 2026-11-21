using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using Klei.AI;
using TUNING;
using UnityEngine;

namespace OniGuideExporter
{
    public static class DataCollector
    {
        private const float AbsoluteZero = 273.15f;
        private static readonly Regex RichTextRegex = new Regex("<[^>]+>", RegexOptions.Compiled);

        private static string CleanText(string raw)
        {
            if (string.IsNullOrEmpty(raw)) return string.Empty;
            string stripped = RichTextRegex.Replace(raw, string.Empty);
            return stripped.Trim();
        }

        private static float ToCelsius(float kelvin)
        {
            return (float)Math.Round(kelvin - AbsoluteZero, 2);
        }

        private static float? SafeToCelsius(float kelvin)
        {
            if (float.IsNaN(kelvin) || float.IsInfinity(kelvin) || kelvin <= 0f) return null;
            return ToCelsius(kelvin);
        }

        private static List<string> SafeTags(KPrefabID prefabId)
        {
            var result = new List<string>();
            if (prefabId == null) return result;
            try
            {
                prefabId.InitializeTags(force_initialize: false);
                foreach (Tag t in prefabId.Tags)
                {
                    if (t.IsValid && !string.IsNullOrEmpty(t.Name))
                    {
                        result.Add(t.Name);
                    }
                }
            }
            catch
            {
                // Fallback if prefab tags cannot be initialized
            }
            result.Sort(StringComparer.Ordinal);
            return result;
        }

        private static string GetPrefabName(GameObject go, string fallbackId)
        {
            if (go == null) return fallbackId;
            try
            {
                string proper = go.GetProperName();
                if (!string.IsNullOrEmpty(proper))
                {
                    string clean = CleanText(proper);
                    if (!string.IsNullOrEmpty(clean)) return clean;
                }
            }
            catch { }

            string tagName = CleanText(TagManager.GetProperName(new Tag(fallbackId), stripLink: true));
            return string.IsNullOrEmpty(tagName) ? fallbackId : tagName;
        }

        private static string GetPrefabDescription(GameObject go)
        {
            if (go == null) return string.Empty;
            var infoDesc = go.GetComponent<InfoDescription>();
            if (infoDesc != null && !string.IsNullOrEmpty(infoDesc.description))
            {
                return CleanText(infoDesc.description);
            }
            return string.Empty;
        }

        private static List<ElementConverterDto> CollectElementConverters(GameObject go)
        {
            var converters = go.GetComponents<ElementConverter>();
            if (converters == null || converters.Length == 0) return null;
            var list = new List<ElementConverterDto>();
            foreach (var conv in converters)
            {
                if (conv == null) continue;
                var dto = new ElementConverterDto();
                if (conv.consumedElements != null)
                {
                    foreach (var c in conv.consumedElements)
                    {
                        if (!c.Tag.IsValid || c.MassConsumptionRate <= 0f) continue;
                        dto.Consumed.Add(new RateElementDto
                        {
                            Tag = c.Tag.Name,
                            KgPerSec = c.MassConsumptionRate
                        });
                    }
                }
                if (conv.outputElements != null)
                {
                    foreach (var o in conv.outputElements)
                    {
                        if (o.elementHash == SimHashes.Vacuum || o.massGenerationRate <= 0f) continue;
                        dto.Produced.Add(new OutputElementDto
                        {
                            Element = o.elementHash.ToString(),
                            KgPerSec = o.massGenerationRate,
                            MinOutputTempC = o.minOutputTemperature > 0f ? SafeToCelsius(o.minOutputTemperature) : null,
                            UseEntityTemperature = o.useEntityTemperature,
                            StoreOutput = o.storeOutput
                        });
                    }
                }
                if (dto.Consumed.Count > 0 || dto.Produced.Count > 0)
                {
                    list.Add(dto);
                }
            }
            return list.Count > 0 ? list : null;
        }

        private static List<ElementConsumerDto> CollectElementConsumers(GameObject go)
        {
            var consumers = go.GetComponents<ElementConsumer>();
            if (consumers == null || consumers.Length == 0) return null;
            var list = new List<ElementConsumerDto>();
            foreach (var c in consumers)
            {
                if (c == null || c.consumptionRate <= 0f) continue;
                list.Add(new ElementConsumerDto
                {
                    Element = c.elementToConsume == SimHashes.Vacuum ? null : c.elementToConsume.ToString(),
                    Configuration = c.configuration.ToString(),
                    KgPerSec = c.consumptionRate,
                    StoreOnConsume = c.storeOnConsume,
                    IsPassive = c is PassiveElementConsumer
                });
            }
            return list.Count > 0 ? list : null;
        }

        private static List<ElementEmitterDto> CollectElementEmitters(GameObject go)
        {
            var emitters = go.GetComponents<ElementEmitter>();
            if (emitters == null || emitters.Length == 0) return null;
            var list = new List<ElementEmitterDto>();
            foreach (var e in emitters)
            {
                if (e == null || e.outputElement.elementHash == SimHashes.Vacuum || e.outputElement.massGenerationRate <= 0f) continue;
                list.Add(new ElementEmitterDto
                {
                    Element = e.outputElement.elementHash.ToString(),
                    KgPerSec = e.outputElement.massGenerationRate,
                    EmissionFrequency = e.emissionFrequency,
                    MaxPressure = e.maxPressure,
                    MinOutputTempC = e.outputElement.minOutputTemperature > 0f ? SafeToCelsius(e.outputElement.minOutputTemperature) : null
                });
            }
            return list.Count > 0 ? list : null;
        }

        private static SublimatesDto CollectSublimates(GameObject go)
        {
            var sub = go.GetComponent<Sublimates>();
            if (sub == null || sub.info.sublimatedElement == SimHashes.Vacuum) return null;
            return new SublimatesDto
            {
                Element = sub.info.sublimatedElement.ToString(),
                SublimationRate = sub.info.sublimationRate,
                MinSublimationAmount = sub.info.minSublimationAmount,
                MaxDestinationMass = sub.info.maxDestinationMass,
                MassPower = sub.info.massPower
            };
        }

        private static List<ManualDeliveryDto> CollectManualDeliveries(GameObject go)
        {
            var deliveries = go.GetComponents<ManualDeliveryKG>();
            if (deliveries == null || deliveries.Length == 0) return null;
            var list = new List<ManualDeliveryDto>();
            foreach (var d in deliveries)
            {
                if (d == null || !d.RequestedItemTag.IsValid) continue;
                list.Add(new ManualDeliveryDto
                {
                    RequestedItemTag = d.RequestedItemTag.Name,
                    CapacityKg = d.capacity,
                    RefillMassKg = d.refillMass
                });
            }
            return list.Count > 0 ? list : null;
        }

        private static ComplexRecipeDto ConvertComplexRecipe(ComplexRecipe r)
        {
            var dto = new ComplexRecipeDto
            {
                Id = r.id,
                RecipeCategoryId = r.recipeCategoryID,
                TimeSec = r.time,
                ConsumedHep = r.consumedHEP,
                ProducedHep = r.producedHEP,
                NameDisplay = r.nameDisplay.ToString(),
                CustomName = CleanText(r.customName),
                Description = CleanText(r.description),
                RequiredDlcIds = r.GetRequiredDlcIds(),
                ForbiddenDlcIds = r.GetForbiddenDlcIds()
            };

            if (r.fabricators != null)
            {
                foreach (var fab in r.fabricators)
                {
                    if (fab.IsValid) dto.Fabricators.Add(fab.Name);
                }
            }

            if (r.ingredients != null)
            {
                foreach (var ing in r.ingredients)
                {
                    dto.Ingredients.Add(new ComplexRecipeElementDto
                    {
                        Material = ing.material.IsValid ? ing.material.Name : null,
                        PossibleMaterials = ing.possibleMaterials != null
                            ? ing.possibleMaterials.Where(t => t.IsValid).Select(t => t.Name).ToList()
                            : null,
                        PossibleMaterialAmounts = ing.possibleMaterialAmounts != null
                            ? ing.possibleMaterialAmounts.ToList()
                            : null,
                        Amount = ing.amount,
                        DoNotConsume = ing.doNotConsume,
                        InheritElement = ing.inheritElement,
                        StoreElement = ing.storeElement,
                        TemperatureOperation = ing.temperatureOperation.ToString(),
                        FacadeId = ing.facadeID
                    });
                }
            }

            if (r.results != null)
            {
                foreach (var res in r.results)
                {
                    dto.Results.Add(new ComplexRecipeElementDto
                    {
                        Material = res.material.IsValid ? res.material.Name : null,
                        PossibleMaterials = res.possibleMaterials != null
                            ? res.possibleMaterials.Where(t => t.IsValid).Select(t => t.Name).ToList()
                            : null,
                        PossibleMaterialAmounts = res.possibleMaterialAmounts != null
                            ? res.possibleMaterialAmounts.ToList()
                            : null,
                        Amount = res.amount,
                        DoNotConsume = res.doNotConsume,
                        InheritElement = res.inheritElement,
                        StoreElement = res.storeElement,
                        TemperatureOperation = res.temperatureOperation.ToString(),
                        FacadeId = res.facadeID
                    });
                }
            }

            return dto;
        }

        private static List<DietInfoDto> CollectDiet(GameObject go)
        {
            var infos = new List<Diet.Info>();
            var smc = go.GetComponent<StateMachineController>();
            if (smc != null)
            {
                var calDef = smc.GetDef<CreatureCalorieMonitor.Def>();
                if (calDef?.diet?.infos != null)
                {
                    infos.AddRange(calDef.diet.infos);
                }
                var gasLiqDef = smc.GetDef<GasAndLiquidConsumerMonitor.Def>();
                if (gasLiqDef?.diet?.infos != null)
                {
                    foreach (var d in gasLiqDef.diet.infos)
                    {
                        if (!infos.Contains(d)) infos.Add(d);
                    }
                }
            }

            if (infos.Count == 0) return null;
            var result = new List<DietInfoDto>();
            foreach (var info in infos)
            {
                if (info == null) continue;
                var tags = new List<string>();
                if (info.consumedTags != null)
                {
                    foreach (var t in info.consumedTags)
                    {
                        if (t.IsValid) tags.Add(t.Name);
                    }
                }
                tags.Sort(StringComparer.Ordinal);
                result.Add(new DietInfoDto
                {
                    ConsumedTags = tags,
                    ProducedElement = info.producedElement.IsValid ? info.producedElement.Name : null,
                    KcalPerKg = info.caloriesPerKg / 1000f,
                    ProducedConversionRate = info.producedConversionRate,
                    FoodType = info.foodType.ToString(),
                    ProduceSolidTile = info.produceSolidTile
                });
            }
            return result.Count > 0 ? result : null;
        }

        public static ExportRoot CollectAll()
        {
            var root = new ExportRoot();
            var allSeenTags = new HashSet<string>(StringComparer.Ordinal);

            void RegisterTag(string tagName)
            {
                if (!string.IsNullOrEmpty(tagName)) allSeenTags.Add(tagName);
            }

            // 1. Metadata
            try
            {
                root.Meta.GameBuild = BuildWatermark.GetBuildText();
                root.Meta.ExportedAtUtc = System.DateTime.UtcNow.ToString("o");
                root.Meta.Language = Localization.GetCurrentLanguageCode();
                var activeDlcs = DlcManager.GetActiveDLCIds();
                if (activeDlcs != null) root.Meta.ActiveDlcs.AddRange(activeDlcs);
                foreach (var dlcId in DlcManager.RELEASED_VERSIONS)
                {
                    if (!string.IsNullOrEmpty(dlcId) && DlcManager.IsContentSubscribed(dlcId))
                    {
                        root.Meta.SubscribedDlcs.Add(dlcId);
                    }
                }
            }
            catch (Exception ex)
            {
                root.Meta.Errors.Add("Meta: " + ex.Message);
            }

            // Track prefabs already classified so we can put remaining useful prefabs into Items
            var classifiedPrefabs = new HashSet<string>(StringComparer.Ordinal);

            // 2. Elements
            try
            {
                if (ElementLoader.elements != null)
                {
                    foreach (var el in ElementLoader.elements)
                    {
                        if (el == null) continue;
                        string id = el.id.ToString();
                        string tagStr = el.tag.IsValid ? el.tag.Name : id;
                        classifiedPrefabs.Add(tagStr);

                        var oreTags = new List<string>();
                        if (el.oreTags != null)
                        {
                            foreach (var t in el.oreTags)
                            {
                                if (t.IsValid && !string.IsNullOrEmpty(t.Name))
                                {
                                    oreTags.Add(t.Name);
                                    RegisterTag(t.Name);
                                }
                            }
                        }
                        oreTags.Sort(StringComparer.Ordinal);

                        string matCat = el.materialCategory.IsValid ? el.materialCategory.Name : null;
                        RegisterTag(matCat);

                        string highTarget = el.highTempTransitionTarget != SimHashes.Vacuum && el.highTempTransitionTarget != 0
                            ? el.highTempTransitionTarget.ToString() : null;
                        string highOre = el.highTempTransitionOreID != SimHashes.Vacuum && el.highTempTransitionOreID != 0
                            ? el.highTempTransitionOreID.ToString() : null;
                        string lowTarget = el.lowTempTransitionTarget != SimHashes.Vacuum && el.lowTempTransitionTarget != 0
                            ? el.lowTempTransitionTarget.ToString() : null;
                        string lowOre = el.lowTempTransitionOreID != SimHashes.Vacuum && el.lowTempTransitionOreID != 0
                            ? el.lowTempTransitionOreID.ToString() : null;
                        string sublimateId = el.sublimateId != SimHashes.Vacuum && el.sublimateId != 0
                            ? el.sublimateId.ToString() : null;
                        string refinedTarget = el.refinedMetalTarget != SimHashes.Vacuum && el.refinedMetalTarget != 0
                            ? el.refinedMetalTarget.ToString() : null;

                        SublimatesDto prefabSub = null;
                        var elPrefab = Assets.TryGetPrefab(el.tag);
                        if (elPrefab != null)
                        {
                            prefabSub = CollectSublimates(elPrefab);
                        }

                        var elDto = new ElementDto
                        {
                            Id = id,
                            Tag = tagStr,
                            Name = CleanText(el.name),
                            Description = CleanText(el.description),
                            State = el.IsSolid ? "Solid" : (el.IsLiquid ? "Liquid" : (el.IsGas ? "Gas" : el.state.ToString())),
                            IsDisabled = el.disabled,
                            MaterialCategory = matCat,
                            OreTags = oreTags,
                            SpecificHeatCapacity = el.specificHeatCapacity,
                            ThermalConductivity = el.thermalConductivity,
                            MolarMass = el.molarMass,
                            DefaultTempC = el.defaultValues.temperature > 0f ? ToCelsius(el.defaultValues.temperature) : 0f,
                            RadiationPer1000Mass = el.radiationPer1000Mass,
                            RefinedMetalTarget = refinedTarget,
                            HighTempC = highTarget != null ? SafeToCelsius(el.highTemp) : null,
                            HighTempTransitionTarget = highTarget,
                            HighTempTransitionOreId = highOre,
                            HighTempTransitionOreMassConversion = el.highTempTransitionOreMassConversion,
                            LowTempC = lowTarget != null ? SafeToCelsius(el.lowTemp) : null,
                            LowTempTransitionTarget = lowTarget,
                            LowTempTransitionOreId = lowOre,
                            LowTempTransitionOreMassConversion = el.lowTempTransitionOreMassConversion,
                            SublimateId = sublimateId,
                            SublimateRate = el.sublimateRate,
                            SublimateEfficiency = el.sublimateEfficiency,
                            SublimateProbability = el.sublimateProbability,
                            OffGasPercentage = el.offGasPercentage,
                            PrefabSublimates = prefabSub
                        };
                        root.Elements.Add(elDto);
                    }
                }
            }
            catch (Exception ex)
            {
                root.Meta.Errors.Add("Elements: " + ex.Message);
            }

            // 3. Foods
            try
            {
                var foodTypes = EdiblesManager.GetAllLoadedFoodTypes();
                if (foodTypes != null)
                {
                    foreach (var food in foodTypes)
                    {
                        if (food == null || string.IsNullOrEmpty(food.Id)) continue;
                        classifiedPrefabs.Add(food.Id);
                        var prefab = Assets.TryGetPrefab(new Tag(food.Id));
                        var tags = prefab != null ? SafeTags(prefab.GetComponent<KPrefabID>()) : new List<string>();
                        foreach (var t in tags) RegisterTag(t);

                        root.Foods.Add(new FoodDto
                        {
                            Id = food.Id,
                            Name = CleanText(food.Name),
                            Description = CleanText(food.Description),
                            KcalPerKg = food.CaloriesPerUnit / 1000f,
                            Quality = food.Quality,
                            CanRot = food.CanRot,
                            SpoilTimeSec = food.SpoilTime,
                            PreserveTempC = ToCelsius(food.PreserveTemperature),
                            RotTempC = ToCelsius(food.RotTemperature),
                            Cooked = food.Cooked,
                            Effects = food.Effects != null ? new List<string>(food.Effects) : new List<string>(),
                            Tags = tags,
                            RequiredDlcIds = food.GetRequiredDlcIds(),
                            ForbiddenDlcIds = food.GetForbiddenDlcIds()
                        });
                    }
                }
            }
            catch (Exception ex)
            {
                root.Meta.Errors.Add("Foods: " + ex.Message);
            }

            // 4. Buildings
            try
            {
                if (Assets.BuildingDefs != null)
                {
                    foreach (var def in Assets.BuildingDefs)
                    {
                        if (def == null || string.IsNullOrEmpty(def.PrefabID)) continue;
                        try
                        {
                            classifiedPrefabs.Add(def.PrefabID);
                            var go = def.BuildingComplete;
                            var kpid = go != null ? go.GetComponent<KPrefabID>() : null;
                            var tags = SafeTags(kpid);
                            foreach (var t in tags) RegisterTag(t);

                            var bDto = new BuildingDto
                            {
                                Id = def.PrefabID,
                                Name = CleanText(def.Name),
                                Description = CleanText(def.Desc),
                                Effect = CleanText(def.Effect),
                                Width = def.WidthInCells,
                                Height = def.HeightInCells,
                                PowerConsumption = def.EnergyConsumptionWhenActive,
                                PowerGeneration = def.GeneratorWattageRating,
                                ExhaustHeatKw = def.ExhaustKilowattsWhenActive,
                                SelfHeatKw = def.SelfHeatKilowattsWhenActive,
                                ConstructionMaterials = def.MaterialCategory,
                                ConstructionMass = def.Mass,
                                ShowInBuildMenu = def.ShowInBuildMenu,
                                Deprecated = def.Deprecated,
                                Tags = tags,
                                RequiredDlcIds = def.RequiredDlcIds,
                                ForbiddenDlcIds = def.ForbiddenDlcIds
                            };

                            if (go != null)
                            {
                                bDto.ElementConverters = CollectElementConverters(go);
                                if (bDto.ElementConverters != null)
                                {
                                    foreach (var ec in bDto.ElementConverters)
                                        foreach (var c in ec.Consumed) RegisterTag(c.Tag);
                                }

                                var gen = go.GetComponent<EnergyGenerator>();
                                if (gen != null)
                                {
                                    var gDto = new EnergyGeneratorDto { Wattage = def.GeneratorWattageRating };
                                    if (gen.formula.inputs != null)
                                    {
                                        foreach (var inp in gen.formula.inputs)
                                        {
                                            if (!inp.tag.IsValid || inp.consumptionRate <= 0f) continue;
                                            RegisterTag(inp.tag.Name);
                                            gDto.Inputs.Add(new RateElementDto { Tag = inp.tag.Name, KgPerSec = inp.consumptionRate });
                                        }
                                    }
                                    if (gen.formula.outputs != null)
                                    {
                                        foreach (var outp in gen.formula.outputs)
                                        {
                                            if (outp.element == SimHashes.Vacuum || outp.creationRate <= 0f) continue;
                                            gDto.Outputs.Add(new OutputElementDto
                                            {
                                                Element = outp.element.ToString(),
                                                KgPerSec = outp.creationRate,
                                                MinOutputTempC = outp.minTemperature > 0f ? SafeToCelsius(outp.minTemperature) : null,
                                                StoreOutput = outp.store
                                            });
                                        }
                                    }
                                    if (gDto.Inputs.Count > 0 || gDto.Outputs.Count > 0)
                                    {
                                        bDto.EnergyGenerator = gDto;
                                    }
                                }

                                bDto.ElementConsumers = CollectElementConsumers(go);
                                bDto.ElementEmitters = CollectElementEmitters(go);
                                bDto.ManualDeliveries = CollectManualDeliveries(go);
                                if (bDto.ManualDeliveries != null)
                                {
                                    foreach (var md in bDto.ManualDeliveries) RegisterTag(md.RequestedItemTag);
                                }
                                bDto.Sublimates = CollectSublimates(go);

                                var tinker = go.GetComponent<TinkerStation>();
                                if (tinker != null && tinker.inputMaterial.IsValid)
                                {
                                    RegisterTag(tinker.inputMaterial.Name);
                                    bDto.TinkerStation = new TinkerStationDto
                                    {
                                        InputMaterial = tinker.inputMaterial.Name,
                                        MassPerTinkerKg = tinker.massPerTinker,
                                        OutputPrefab = tinker.outputPrefab.IsValid ? tinker.outputPrefab.Name : null,
                                        ToolProductionTimeSec = tinker.toolProductionTime
                                    };
                                }

                                var flushToilet = go.GetComponent<FlushToilet>();
                                if (flushToilet != null)
                                {
                                    bDto.FlushToilet = new FlushToiletDto
                                    {
                                        MassConsumedPerUseKg = flushToilet.massConsumedPerUse,
                                        MassEmittedPerUseKg = flushToilet.massEmittedPerUse,
                                        NewPeeTempC = ToCelsius(flushToilet.newPeeTemperature)
                                    };
                                }

                                var outhouse = go.GetComponent<Toilet>();
                                if (outhouse != null)
                                {
                                    bDto.Outhouse = new OuthouseDto
                                    {
                                        DirtUsedPerFlushKg = outhouse.dirtUsedPerFlush,
                                        SolidWasteElement = outhouse.solidWastePerUse.elementID.ToString(),
                                        SolidWasteMassKg = outhouse.solidWastePerUse.mass,
                                        MaxFlushes = outhouse.maxFlushes
                                    };
                                }

                                var sanitizer = go.GetComponent<HandSanitizer>();
                                if (sanitizer != null)
                                {
                                    bDto.HandSanitizer = new HandSanitizerDto
                                    {
                                        ConsumedElement = sanitizer.consumedElement.ToString(),
                                        OutputElement = sanitizer.outputElement == SimHashes.Vacuum ? null : sanitizer.outputElement.ToString(),
                                        MassConsumedPerUseKg = sanitizer.massConsumedPerUse
                                    };
                                }

                                var research = go.GetComponent<ResearchCenter>();
                                if (research != null)
                                {
                                    if (research.inputMaterial.IsValid) RegisterTag(research.inputMaterial.Name);
                                    bDto.ResearchCenter = new ResearchCenterDto
                                    {
                                        InputMaterial = research.inputMaterial.IsValid ? research.inputMaterial.Name : null,
                                        MassPerPointKg = research.mass_per_point,
                                        ResearchPointTypeId = research.research_point_type_id
                                    };
                                }

                                var oilWell = go.GetComponent<OilWellCap>();
                                if (oilWell != null)
                                {
                                    bDto.OilWellCap = new OilWellCapDto
                                    {
                                        GasElement = oilWell.gasElement.ToString(),
                                        AddGasRateKgPerSec = oilWell.addGasRate,
                                        GasTempC = ToCelsius(oilWell.gasTemperature)
                                    };
                                }

                                var rocketCluster = go.GetComponent<RocketEngineCluster>();
                                if (rocketCluster != null)
                                {
                                    if (rocketCluster.fuelTag.IsValid) RegisterTag(rocketCluster.fuelTag.Name);
                                    bDto.RocketEngine = new RocketEngineDto
                                    {
                                        FuelTag = rocketCluster.fuelTag.IsValid ? rocketCluster.fuelTag.Name : null,
                                        RequireOxidizer = rocketCluster.requireOxidizer,
                                        ExhaustElement = rocketCluster.exhaustElement == SimHashes.Vacuum ? null : rocketCluster.exhaustElement.ToString(),
                                        ExhaustEmitRateKgPerSec = rocketCluster.exhaustEmitRate,
                                        ExhaustTempC = ToCelsius(rocketCluster.exhaustTemperature),
                                        Efficiency = rocketCluster.efficiency,
                                        IsCluster = true
                                    };
                                }
                                else
                                {
                                    var rocketBase = go.GetComponent<RocketEngine>();
                                    if (rocketBase != null)
                                    {
                                        if (rocketBase.fuelTag.IsValid) RegisterTag(rocketBase.fuelTag.Name);
                                        bDto.RocketEngine = new RocketEngineDto
                                        {
                                            FuelTag = rocketBase.fuelTag.IsValid ? rocketBase.fuelTag.Name : null,
                                            RequireOxidizer = rocketBase.requireOxidizer,
                                            ExhaustElement = rocketBase.exhaustElement == SimHashes.Vacuum ? null : rocketBase.exhaustElement.ToString(),
                                            ExhaustEmitRateKgPerSec = rocketBase.exhaustEmitRate,
                                            ExhaustTempC = ToCelsius(rocketBase.exhaustTemperature),
                                            Efficiency = rocketBase.efficiency,
                                            IsCluster = false
                                        };
                                    }
                                }

                                // Nuclear Reactor
                                if (go.GetComponent<Reactor>() != null)
                                {
                                    bDto.NuclearReactor = new NuclearReactorDto
                                    {
                                        FuelElement = SimHashes.EnrichedUranium.ToString(),
                                        FuelKgPerSec = NuclearReactorConfig.FUEL_CONSUMPTION_SPEED,
                                        WasteElement = SimHashes.NuclearWaste.ToString(),
                                        WasteKgPerSec = NuclearReactorConfig.FUEL_CONSUMPTION_SPEED * NuclearReactorConfig.WASTE_MASS_MULTIPLIER,
                                        CoolantElement = SimHashes.Water.ToString(),
                                        CoolantCapacityKg = NuclearReactorConfig.COOLANT_CAPACITY,
                                        VentSteamTempC = ToCelsius(NuclearReactorConfig.VENT_STEAM_TEMPERATURE)
                                    };
                                }

                                // Food Rehydrator
                                if (def.PrefabID == FoodRehydratorConfig.ID)
                                {
                                    RegisterTag(GameTags.Dehydrated.Name);
                                    bDto.Rehydrator = new RehydratorDto
                                    {
                                        WaterTag = FoodRehydratorConfig.REHYDRATION_TAG.Name,
                                        WaterKgPerUse = FoodRehydratorConfig.REHYDRATION_COST,
                                        FoodTag = GameTags.Dehydrated.Name
                                    };
                                }

                                // Recreation & Critter Feeder per-use recipes
                                var perUse = new List<PerUseRecipeDto>();

                                var soda = go.GetComponent<SodaFountain>();
                                if (soda != null)
                                {
                                    var r = new PerUseRecipeDto { Kind = "SodaFountain" };
                                    if (soda.waterMassPerUse > 0f)
                                        r.Consumed.Add(new PerUseItemDto { Tag = SimHashes.Water.ToString(), Kg = soda.waterMassPerUse });
                                    if (soda.ingredientTag.IsValid && soda.ingredientMassPerUse > 0f)
                                    {
                                        RegisterTag(soda.ingredientTag.Name);
                                        r.Consumed.Add(new PerUseItemDto { Tag = soda.ingredientTag.Name, Kg = soda.ingredientMassPerUse });
                                    }
                                    if (r.Consumed.Count > 0) perUse.Add(r);
                                }

                                var espresso = go.GetComponent<EspressoMachine>();
                                if (espresso != null)
                                {
                                    var r = new PerUseRecipeDto { Kind = "EspressoMachine" };
                                    r.Consumed.Add(new PerUseItemDto { Tag = SimHashes.Water.ToString(), Kg = EspressoMachine.WATER_MASS_PER_USE });
                                    if (EspressoMachine.INGREDIENT_TAG.IsValid)
                                    {
                                        RegisterTag(EspressoMachine.INGREDIENT_TAG.Name);
                                        r.Consumed.Add(new PerUseItemDto { Tag = EspressoMachine.INGREDIENT_TAG.Name, Kg = EspressoMachine.INGREDIENT_MASS_PER_USE });
                                    }
                                    perUse.Add(r);
                                }

                                var juicer = go.GetComponent<Juicer>();
                                if (juicer != null)
                                {
                                    var r = new PerUseRecipeDto { Kind = "Juicer" };
                                    if (juicer.waterMassPerUse > 0f)
                                        r.Consumed.Add(new PerUseItemDto { Tag = SimHashes.Water.ToString(), Kg = juicer.waterMassPerUse });
                                    if (juicer.ingredientTags != null && juicer.ingredientMassesPerUse != null)
                                    {
                                        int count = Math.Min(juicer.ingredientTags.Length, juicer.ingredientMassesPerUse.Length);
                                        for (int i = 0; i < count; i++)
                                        {
                                            if (juicer.ingredientTags[i].IsValid && juicer.ingredientMassesPerUse[i] > 0f)
                                            {
                                                RegisterTag(juicer.ingredientTags[i].Name);
                                                r.Consumed.Add(new PerUseItemDto { Tag = juicer.ingredientTags[i].Name, Kg = juicer.ingredientMassesPerUse[i] });
                                            }
                                        }
                                    }
                                    if (r.Consumed.Count > 0) perUse.Add(r);
                                }

                                var cooler = go.GetComponent<WaterCooler>();
                                if (cooler != null && WaterCoolerConfig.BEVERAGE_CHOICE_OPTIONS != null)
                                {
                                    foreach (var opt in WaterCoolerConfig.BEVERAGE_CHOICE_OPTIONS)
                                    {
                                        if (opt != null && opt.first.IsValid)
                                        {
                                            RegisterTag(opt.first.Name);
                                            var r = new PerUseRecipeDto { Kind = "WaterCooler" };
                                            r.Consumed.Add(new PerUseItemDto { Tag = opt.first.Name, Kg = WaterCooler.DRINK_MASS });
                                            perUse.Add(r);
                                        }
                                    }
                                }

                                var smcB = go.GetComponent<StateMachineController>();
                                if (smcB != null && smcB.GetDef<MilkFeeder.Def>() != null && MilkFeederConfig.EffectsPerDrinkableLiquid != null)
                                {
                                    foreach (var opt in MilkFeederConfig.EffectsPerDrinkableLiquid)
                                    {
                                        if (opt != null && opt.first.IsValid)
                                        {
                                            RegisterTag(opt.first.Name);
                                            var r = new PerUseRecipeDto { Kind = "MilkFeeder" };
                                            r.Consumed.Add(new PerUseItemDto { Tag = opt.first.Name, Kg = MilkFeederConfig.UNITS_OF_MILK_CONSUMED_PER_FEEDING });
                                            perUse.Add(r);
                                        }
                                    }
                                }

                                if (perUse.Count > 0)
                                {
                                    bDto.PerUseRecipes = perUse;
                                }
                            }

                            root.Buildings.Add(bDto);
                        }
                        catch (Exception ex)
                        {
                            root.Meta.Errors.Add($"Building[{def.PrefabID}]: {ex.Message}");
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                root.Meta.Errors.Add("Buildings: " + ex.Message);
            }

            // 5. Complex Recipes (both pre-process with possibleMaterials and fully expanded)
            try
            {
                var crm = ComplexRecipeManager.Get();
                if (crm != null)
                {
                    if (crm.preProcessRecipes != null)
                    {
                        foreach (var r in crm.preProcessRecipes)
                        {
                            if (r == null) continue;
                            var dto = ConvertComplexRecipe(r);
                            foreach (var ing in dto.Ingredients)
                            {
                                RegisterTag(ing.Material);
                                if (ing.PossibleMaterials != null)
                                    foreach (var pm in ing.PossibleMaterials) RegisterTag(pm);
                            }
                            root.ComplexRecipesPreProcess.Add(dto);
                        }
                    }
                    if (crm.recipes != null)
                    {
                        foreach (var r in crm.recipes)
                        {
                            if (r == null) continue;
                            root.ComplexRecipesExpanded.Add(ConvertComplexRecipe(r));
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                root.Meta.Errors.Add("ComplexRecipes: " + ex.Message);
            }

            // 6. Duplicants (Standard & Bionic)
            try
            {
                var standardStats = DUPLICANTSTATS.GetStatsFor(GameTags.Minions.Models.Standard);
                var standardPrefab = Assets.TryGetPrefab(GameTags.Minions.Models.Standard);
                if (standardPrefab != null) classifiedPrefabs.Add(GameTags.Minions.Models.Standard.Name);
                var stdTags = standardPrefab != null ? SafeTags(standardPrefab.GetComponent<KPrefabID>()) : new List<string>();
                foreach (var t in stdTags) RegisterTag(t);

                float stdO2 = standardStats.BaseStats.OXYGEN_USED_PER_SECOND;
                float stdConv = standardStats.BaseStats.OXYGEN_TO_CO2_CONVERSION;
                root.Duplicants.Add(new DuplicantDto
                {
                    Id = GameTags.Minions.Models.Standard.Name,
                    Name = CleanText(MinionConfig.NAME),
                    OxygenKgPerSec = stdO2,
                    O2ToCo2Conversion = stdConv,
                    Co2KgPerSec = stdO2 * stdConv,
                    KcalPerCycle = Math.Abs(standardStats.BaseStats.CALORIES_BURNED_PER_CYCLE) / 1000f,
                    PeePerToiletKg = standardStats.Secretions.PEE_PER_TOILET_PEE,
                    Tags = stdTags,
                    RequiredDlcIds = null
                });

                if (DlcManager.IsContentSubscribed(DlcManager.DLC3_ID))
                {
                    var bionicStats = DUPLICANTSTATS.GetStatsFor(GameTags.Minions.Models.Bionic);
                    var bionicPrefab = Assets.TryGetPrefab(GameTags.Minions.Models.Bionic);
                    if (bionicPrefab != null) classifiedPrefabs.Add(GameTags.Minions.Models.Bionic.Name);
                    var bioTags = bionicPrefab != null ? SafeTags(bionicPrefab.GetComponent<KPrefabID>()) : new List<string>();
                    foreach (var t in bioTags) RegisterTag(t);

                    var batteryTags = new List<string>();
                    if (GameTags.BionicCompatibleBatteries != null)
                    {
                        foreach (var bt in GameTags.BionicCompatibleBatteries)
                        {
                            if (bt.IsValid)
                            {
                                batteryTags.Add(bt.Name);
                                RegisterTag(bt.Name);
                            }
                        }
                    }

                    var lubTags = new List<string> { GameTags.LubricatingOil.Name };
                    RegisterTag(GameTags.LubricatingOil.Name);

                    float bioO2 = bionicStats.BaseStats.OXYGEN_USED_PER_SECOND;
                    root.Duplicants.Add(new DuplicantDto
                    {
                        Id = GameTags.Minions.Models.Bionic.Name,
                        Name = CleanText(BionicMinionConfig.NAME),
                        OxygenKgPerSec = bioO2,
                        O2ToCo2Conversion = 0f,
                        Co2KgPerSec = 0f,
                        BaseWattage = 200f,
                        OilKgPerSec = 1f / 30f,
                        CompatibleBatteryTags = batteryTags,
                        LubricantTags = lubTags,
                        Tags = bioTags,
                        RequiredDlcIds = DlcManager.DLC3
                    });
                }
            }
            catch (Exception ex)
            {
                root.Meta.Errors.Add("Duplicants: " + ex.Message);
            }

            // 7. Prefabs scan: Critters, Eggs, Plants, Seeds, Geysers, Other Items
            try
            {
                if (Assets.Prefabs != null)
                {
                    foreach (var kpid in Assets.Prefabs)
                    {
                        if (kpid == null || !kpid.PrefabTag.IsValid) continue;
                        string id = kpid.PrefabTag.Name;
                        if (string.IsNullOrEmpty(id)) continue;

                        var go = kpid.gameObject;
                        if (go == null) continue;

                        try
                        {
                            var smc = go.GetComponent<StateMachineController>();
                            var tags = SafeTags(kpid);
                            foreach (var t in tags) RegisterTag(t);

                            // Geysers
                            var geyserCfg = go.GetComponent<GeyserConfigurator>();
                            if (geyserCfg != null && geyserCfg.presetType.IsValid)
                            {
                                var gt = GeyserConfigurator.FindType(geyserCfg.presetType);
                                if (gt != null)
                                {
                                    classifiedPrefabs.Add(id);
                                    root.Geysers.Add(new GeyserDto
                                    {
                                        Id = id,
                                        GeyserTypeId = gt.id,
                                        Name = GetPrefabName(go, id),
                                        Description = GetPrefabDescription(go),
                                        Element = gt.element.ToString(),
                                        Shape = gt.shape.ToString(),
                                        TemperatureC = ToCelsius(gt.temperature),
                                        MinRatePerCycleKg = gt.minRatePerCycle,
                                        MaxRatePerCycleKg = gt.maxRatePerCycle,
                                        MaxPressureKg = gt.maxPressure,
                                        MinIterationLength = gt.minIterationLength,
                                        MaxIterationLength = gt.maxIterationLength,
                                        MinIterationPercent = gt.minIterationPercent,
                                        MaxIterationPercent = gt.maxIterationPercent,
                                        MinYearLength = gt.minYearLength,
                                        MaxYearLength = gt.maxYearLength,
                                        MinYearPercent = gt.minYearPercent,
                                        MaxYearPercent = gt.maxYearPercent,
                                        RequiredDlcIds = gt.GetRequiredDlcIds(),
                                        ForbiddenDlcIds = gt.GetForbiddenDlcIds()
                                    });
                                    continue;
                                }
                            }

                            // Eggs
                            var incDef = smc != null ? smc.GetDef<IncubationMonitor.Def>() : null;
                            if (incDef != null)
                            {
                                classifiedPrefabs.Add(id);
                                var pe = go.GetComponent<PrimaryElement>();
                                float incCycles = incDef.baseIncubationRate > 0f ? 100f / (incDef.baseIncubationRate * 600f) : 0f;
                                root.Eggs.Add(new EggDto
                                {
                                    Id = id,
                                    Name = GetPrefabName(go, id),
                                    Description = GetPrefabDescription(go),
                                    MassKg = pe != null ? pe.Mass : 0f,
                                    SpawnedCreature = incDef.spawnedCreature.IsValid ? incDef.spawnedCreature.Name : null,
                                    BaseIncubationCycles = (float)Math.Round(incCycles, 3),
                                    EggShellRatio = incDef.eggShellRatio,
                                    PreventEggDrops = incDef.preventEggDrops,
                                    Tags = tags,
                                    RequiredDlcIds = kpid.GetRequiredDlcIds(),
                                    ForbiddenDlcIds = kpid.GetForbiddenDlcIds()
                                });
                                continue;
                            }

                            // Seeds
                            var plantableSeed = go.GetComponent<PlantableSeed>();
                            if (plantableSeed != null)
                            {
                                classifiedPrefabs.Add(id);
                                root.Seeds.Add(new SeedDto
                                {
                                    Id = id,
                                    Name = GetPrefabName(go, id),
                                    Description = GetPrefabDescription(go),
                                    PlantId = plantableSeed.PlantID.IsValid ? plantableSeed.PlantID.Name : null,
                                    Direction = plantableSeed.Direction.ToString(),
                                    Tags = tags,
                                    RequiredDlcIds = kpid.GetRequiredDlcIds(),
                                    ForbiddenDlcIds = kpid.GetForbiddenDlcIds()
                                });
                                continue;
                            }

                            // Critters (including Babies & Beeta Hive)
                            var brain = go.GetComponent<CreatureBrain>();
                            var babyDef = smc != null ? smc.GetDef<BabyMonitor.Def>() : null;
                            var beeHiveDef = smc != null ? smc.GetDef<BeeHive.Def>() : null;
                            if (brain != null || babyDef != null || beeHiveDef != null)
                            {
                                classifiedPrefabs.Add(id);
                                var pe = go.GetComponent<PrimaryElement>();

                                float? kcalPerCycle = null;
                                var mods = go.GetComponent<Modifiers>();
                                if (mods != null)
                                {
                                    try
                                    {
                                        float calDeltaPerSec = mods.GetPreModifiedAttributeValue(Db.Get().Amounts.Calories.deltaAttribute);
                                        if (calDeltaPerSec < 0f)
                                        {
                                            kcalPerCycle = (float)Math.Round(-calDeltaPerSec * 600f / 1000f, 3);
                                        }
                                    }
                                    catch { }
                                }

                                var diet = CollectDiet(go);
                                if (beeHiveDef != null && (diet == null || diet.Count == 0))
                                {
                                    diet = new List<DietInfoDto>
                                    {
                                        new DietInfoDto
                                        {
                                            ConsumedTags = new List<string> { BeeHiveTuning.CONSUMED_ORE.Name },
                                            ProducedElement = BeeHiveTuning.PRODUCED_ORE.Name,
                                            KcalPerKg = BeeHiveTuning.CALORIES_PER_KG_OF_ORE / 1000f,
                                            ProducedConversionRate = BeeHiveTuning.POOP_CONVERSTION_RATE,
                                            FoodType = "EatSolid",
                                            ProduceSolidTile = false
                                        }
                                    };
                                }
                                if (diet != null)
                                {
                                    foreach (var d in diet)
                                    {
                                        foreach (var ct in d.ConsumedTags) RegisterTag(ct);
                                        RegisterTag(d.ProducedElement);
                                    }
                                }

                                FertilityDto fertilityDto = null;
                                var fertDef = smc != null ? smc.GetDef<FertilityMonitor.Def>() : null;
                                if (fertDef != null)
                                {
                                    fertilityDto = new FertilityDto
                                    {
                                        BaseFertileCycles = fertDef.baseFertileCycles
                                    };
                                    if (fertDef.initialBreedingWeights != null)
                                    {
                                        foreach (var bw in fertDef.initialBreedingWeights)
                                        {
                                            fertilityDto.BreedingWeights.Add(new BreedingWeightDto
                                            {
                                                EggId = bw.egg.Name,
                                                Weight = bw.weight
                                            });
                                        }
                                    }
                                }

                                var shearables = new List<ShearableDto>();
                                if (smc != null)
                                {
                                    var scaleDef = smc.GetDef<ScaleGrowthMonitor.Def>();
                                    if (scaleDef != null && scaleDef.itemDroppedOnShear.IsValid)
                                    {
                                        shearables.Add(new ShearableDto
                                        {
                                            Kind = "ScaleGrowth",
                                            ItemDropped = scaleDef.itemDroppedOnShear.Name,
                                            DropMassKg = scaleDef.dropMass,
                                            GrowthCycles = scaleDef.defaultGrowthRate > 0f ? (float)Math.Round(1f / (scaleDef.defaultGrowthRate * 600f), 3) : 0f,
                                            TargetAtmosphere = scaleDef.targetAtmosphere != 0 && scaleDef.targetAtmosphere != SimHashes.Vacuum ? scaleDef.targetAtmosphere.ToString() : null
                                        });
                                    }
                                    var wellFedDef = smc.GetDef<WellFedShearable.Def>();
                                    if (wellFedDef != null && wellFedDef.itemDroppedOnShear.IsValid)
                                    {
                                        shearables.Add(new ShearableDto
                                        {
                                            Kind = "WellFedShearable",
                                            ItemDropped = wellFedDef.itemDroppedOnShear.Name,
                                            DropMassKg = wellFedDef.dropMass,
                                            GrowthCycles = wellFedDef.growthDurationCycles,
                                            RequiredDiet = wellFedDef.requiredDiet.IsValid ? wellFedDef.requiredDiet.Name : null
                                        });
                                    }
                                }

                                MilkProductionDto milkDto = null;
                                var milkDef = smc != null ? smc.GetDef<MilkProductionMonitor.Def>() : null;
                                if (milkDef != null)
                                {
                                    milkDto = new MilkProductionDto
                                    {
                                        Element = milkDef.element.ToString(),
                                        CapacityKg = milkDef.Capacity,
                                        CaloriesPerCycle = milkDef.CaloriesPerCycle
                                    };
                                }

                                Dictionary<string, float> butcherDrops = null;
                                var butcherable = go.GetComponent<Butcherable>();
                                if (butcherable != null && butcherable.drops != null && butcherable.drops.Count > 0)
                                {
                                    butcherDrops = new Dictionary<string, float>(butcherable.drops);
                                }

                                ElementDropperDto dropperDto = null;
                                var dropDef = smc != null ? smc.GetDef<ElementDropperMonitor.Def>() : null;
                                if (dropDef != null && dropDef.dirtyEmitElement != SimHashes.Vacuum)
                                {
                                    dropperDto = new ElementDropperDto
                                    {
                                        Element = dropDef.dirtyEmitElement.ToString(),
                                        MassPerDropKg = dropDef.dirtyMassPerDirty,
                                        ProbabilityPercent = dropDef.dirtyProbabilityPercent,
                                        MassReleaseOnDeathKg = dropDef.dirtyMassReleaseOnDeath
                                    };
                                }

                                root.Critters.Add(new CritterDto
                                {
                                    Id = id,
                                    Name = GetPrefabName(go, id),
                                    Description = GetPrefabDescription(go),
                                    Species = brain != null && brain.species.IsValid ? brain.species.Name : null,
                                    IsBaby = babyDef != null,
                                    AdultPrefab = babyDef != null && babyDef.adultPrefab.IsValid ? babyDef.adultPrefab.Name : null,
                                    BabyGrowCycles = babyDef != null ? (float?)babyDef.adultThreshold : null,
                                    OnGrowDropId = babyDef != null ? babyDef.onGrowDropID : null,
                                    OnGrowDropUnits = babyDef != null ? babyDef.onGrowDropUnits : 0f,
                                    MassKg = pe != null ? pe.Mass : 0f,
                                    KcalPerCycle = kcalPerCycle,
                                    Tags = tags,
                                    RequiredDlcIds = kpid.GetRequiredDlcIds(),
                                    ForbiddenDlcIds = kpid.GetForbiddenDlcIds(),
                                    Diet = diet,
                                    Fertility = fertilityDto,
                                    Shearables = shearables.Count > 0 ? shearables : null,
                                    MilkProduction = milkDto,
                                    ButcherDrops = butcherDrops,
                                    ElementConverters = CollectElementConverters(go),
                                    ElementConsumers = CollectElementConsumers(go),
                                    ElementEmitters = CollectElementEmitters(go),
                                    ElementDropper = dropperDto
                                });
                                continue;
                            }

                            // Plants
                            var crop = go.GetComponent<Crop>();
                            var growing = go.GetComponent<Growing>();
                            var wilt = go.GetComponent<WiltCondition>();
                            var seedProd = go.GetComponent<SeedProducer>();
                            var critterTrap = go.GetComponent<CritterTrapPlant>();
                            var irrDef = smc != null ? smc.GetDef<IrrigationMonitor.Def>() : null;
                            var fertPlantDef = smc != null ? smc.GetDef<FertilizationMonitor.Def>() : null;
                            var branchDef = smc != null ? smc.GetDef<PlantBranchGrower.Def>() : null;
                            var spaceTreeDef = smc != null ? smc.GetDef<SpaceTreePlant.Def>() : null;

                            if (crop != null || growing != null || wilt != null || seedProd != null || critterTrap != null || irrDef != null || fertPlantDef != null || branchDef != null || spaceTreeDef != null)
                            {
                                classifiedPrefabs.Add(id);

                                CropDto cropDto = null;
                                if (crop != null && crop.cropVal != null)
                                {
                                    cropDto = new CropDto
                                    {
                                        CropDurationSec = crop.cropVal.cropDuration,
                                        CropDurationCycles = (float)Math.Round(crop.cropVal.cropDuration / 600f, 3),
                                        Renewable = crop.cropVal.renewable
                                    };
                                    if (crop.cropVal.products != null)
                                    {
                                        foreach (var p in crop.cropVal.products)
                                        {
                                            cropDto.Products.Add(new CropProductDto { CropId = p.cropId, Quantity = p.quantity });
                                        }
                                    }
                                }

                                List<RateElementDto> irrigation = null;
                                if (irrDef?.consumedElements != null && irrDef.consumedElements.Length > 0)
                                {
                                    irrigation = new List<RateElementDto>();
                                    foreach (var ci in irrDef.consumedElements)
                                    {
                                        if (!ci.tag.IsValid) continue;
                                        RegisterTag(ci.tag.Name);
                                        irrigation.Add(new RateElementDto { Tag = ci.tag.Name, KgPerSec = ci.massConsumptionRate });
                                    }
                                }

                                List<RateElementDto> fertilization = null;
                                if (fertPlantDef?.consumedElements != null && fertPlantDef.consumedElements.Length > 0)
                                {
                                    fertilization = new List<RateElementDto>();
                                    foreach (var ci in fertPlantDef.consumedElements)
                                    {
                                        if (!ci.tag.IsValid) continue;
                                        RegisterTag(ci.tag.Name);
                                        fertilization.Add(new RateElementDto { Tag = ci.tag.Name, KgPerSec = ci.massConsumptionRate });
                                    }
                                }

                                SeedProducerDto seedProdDto = null;
                                if (seedProd != null && !string.IsNullOrEmpty(seedProd.seedInfo.seedId))
                                {
                                    seedProdDto = new SeedProducerDto
                                    {
                                        SeedId = seedProd.seedInfo.seedId,
                                        ProductionType = seedProd.seedInfo.productionType.ToString(),
                                        NewSeedsProduced = seedProd.seedInfo.newSeedsProduced,
                                        SeedDropChance = seedProd.seedDropChances
                                    };
                                }

                                CritterTrapDto trapDto = null;
                                if (critterTrap != null)
                                {
                                    trapDto = new CritterTrapDto
                                    {
                                        OutputElement = critterTrap.outputElement.ToString(),
                                        GasOutputRateKgPerSec = critterTrap.gasOutputRate
                                    };
                                    if (critterTrap.CONSUMABLE_TAGs != null)
                                    {
                                        foreach (var ct in critterTrap.CONSUMABLE_TAGs)
                                        {
                                            if (ct.IsValid)
                                            {
                                                trapDto.ConsumableTags.Add(ct.Name);
                                                RegisterTag(ct.Name);
                                            }
                                        }
                                    }
                                }

                                BranchGrowerDto branchDto = null;
                                if (branchDef != null)
                                {
                                    branchDto = new BranchGrowerDto
                                    {
                                        BranchPrefabName = branchDef.BRANCH_PREFAB_NAME,
                                        MaxBranchCount = branchDef.MAX_BRANCH_COUNT
                                    };
                                }

                                SpaceTreeDto spaceTreeDto = null;
                                if (spaceTreeDef != null)
                                {
                                    spaceTreeDto = new SpaceTreeDto
                                    {
                                        OptimalBranches = spaceTreeDef.OptimalAmountOfBranches,
                                        OptimalProductionDurationSec = spaceTreeDef.OptimalProductionDuration,
                                        ProductElement = spaceTreeDef.productElement != null ? spaceTreeDef.productElement.id.ToString() : null
                                    };
                                }

                                root.Plants.Add(new PlantDto
                                {
                                    Id = id,
                                    Name = GetPrefabName(go, id),
                                    Description = GetPrefabDescription(go),
                                    Tags = tags,
                                    RequiredDlcIds = kpid.GetRequiredDlcIds(),
                                    ForbiddenDlcIds = kpid.GetForbiddenDlcIds(),
                                    Crop = cropDto,
                                    Irrigation = irrigation,
                                    Fertilization = fertilization,
                                    SeedProducer = seedProdDto,
                                    ElementConverters = CollectElementConverters(go),
                                    ElementConsumers = CollectElementConsumers(go),
                                    ElementEmitters = CollectElementEmitters(go),
                                    Sublimates = CollectSublimates(go),
                                    CritterTrap = trapDto,
                                    BranchGrower = branchDto,
                                    SpaceTree = spaceTreeDto
                                });
                                continue;
                            }
                        }
                        catch (Exception ex)
                        {
                            root.Meta.Errors.Add($"Prefab[{id}]: {ex.Message}");
                        }
                    }

                    // 8. Remaining pickupable / craftable / tagged items (equipment, medicine, electrobanks, industrial items, etc.)
                    foreach (var kpid in Assets.Prefabs)
                    {
                        if (kpid == null || !kpid.PrefabTag.IsValid) continue;
                        string id = kpid.PrefabTag.Name;
                        if (string.IsNullOrEmpty(id) || classifiedPrefabs.Contains(id)) continue;

                        var go = kpid.gameObject;
                        if (go == null) continue;

                        // Filter out pure VFX/UI/internal helper prefabs: keep items with Pickupable, Equippable, Electrobank, MedicinalPill, or meaningful tags
                        var pickup = go.GetComponent<Pickupable>();
                        var equip = go.GetComponent<Equippable>();
                        var bank = go.GetComponent<Electrobank>();
                        if (pickup == null && equip == null && bank == null) continue;

                        try
                        {
                            var tags = SafeTags(kpid);
                            foreach (var t in tags) RegisterTag(t);
                            var pe = go.GetComponent<PrimaryElement>();

                            root.Items.Add(new ItemDto
                            {
                                Id = id,
                                Name = GetPrefabName(go, id),
                                Description = GetPrefabDescription(go),
                                MassKg = pe != null ? (float?)pe.Mass : null,
                                ElectrobankCapacityJ = bank != null ? (float?)bank.Charge : null,
                                ElectrobankRechargeable = bank != null ? (bool?)bank.rechargeable : null,
                                Sublimates = CollectSublimates(go),
                                Tags = tags,
                                RequiredDlcIds = kpid.GetRequiredDlcIds(),
                                ForbiddenDlcIds = kpid.GetForbiddenDlcIds()
                            });
                        }
                        catch (Exception ex)
                        {
                            root.Meta.Errors.Add($"Item[{id}]: {ex.Message}");
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                root.Meta.Errors.Add("Prefabs: " + ex.Message);
            }

            // 9. Resolve tag membership index for every discovered tag
            try
            {
                foreach (string tagName in allSeenTags.OrderBy(t => t, StringComparer.Ordinal))
                {
                    var tag = new Tag(tagName);
                    string proper = CleanText(TagManager.GetProperName(tag, stripLink: true));
                    var tagDto = new TagDto
                    {
                        Id = tagName,
                        Name = string.IsNullOrEmpty(proper) ? tagName : proper
                    };

                    if (ElementLoader.elements != null)
                    {
                        foreach (var el in ElementLoader.elements)
                        {
                            if (el == null || el.disabled) continue;
                            if (el.HasTag(tag) || el.materialCategory == tag)
                            {
                                tagDto.ElementMembers.Add(el.id.ToString());
                            }
                        }
                    }

                    var taggedPrefabs = Assets.GetPrefabsWithTag(tag);
                    if (taggedPrefabs != null)
                    {
                        foreach (var p in taggedPrefabs)
                        {
                            if (p == null) continue;
                            var pId = p.GetComponent<KPrefabID>();
                            if (pId != null && pId.PrefabTag.IsValid)
                            {
                                string pName = pId.PrefabTag.Name;
                                if (!tagDto.ElementMembers.Contains(pName) && !tagDto.PrefabMembers.Contains(pName))
                                {
                                    tagDto.PrefabMembers.Add(pName);
                                }
                            }
                        }
                    }

                    tagDto.ElementMembers.Sort(StringComparer.Ordinal);
                    tagDto.PrefabMembers.Sort(StringComparer.Ordinal);
                    root.Tags[tagName] = tagDto;
                }
            }
            catch (Exception ex)
            {
                root.Meta.Errors.Add("Tags: " + ex.Message);
            }

            return root;
        }
    }
}
