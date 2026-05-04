let STEAM_FEE = 0.02;
let MAX_ITEM_PRICE = 100;
let MIN_ITEM_PRICE = 0.2;
let MAX_CONTRACT_PRICE = 1000;
let MIN_PROFITABILITY = 0;

const WEAR_RANGES = {
    'Factory New': [0.0, 0.07],
    'Minimal Wear': [0.07, 0.15],
    'Field-Tested': [0.15, 0.38],
    'Well-Worn': [0.38, 0.45],
    'Battle-Scarred': [0.45, 1.0]
};

let ALLOWED_WEARS = ['Minimal Wear', 'Field-Tested'];

const RARITY_ORDER = {
    'rarity_common_weapon': 0,
    'rarity_uncommon_weapon': 1,
    'rarity_rare_weapon': 2,
    'rarity_mythical_weapon': 3,
    'rarity_legendary_weapon': 4,
    'rarity_ancient_weapon': 5,
    'rarity_extraordinary': 6
};

const RARITY_NAMES = {
    0: 'Consumer Grade',
    1: 'Industrial Grade',
    2: 'Mil-Spec Grade',
    3: 'Restricted',
    4: 'Classified',
    5: 'Covert',
    6: 'Extraordinary'
};

const BANNED_COLLECTIONS = ["collection-set-xpshop-wpn-01"];

let ALLOWED_RARITIES = [1, 2, 3];

let SKIP_LOW_QUANTITY = false;
let LOW_QUANTITY_THRESHOLD = 1;
let USER_BANNED_COLLECTIONS = [];

let prices = [];
let collections = [];
let items = {};
let allItemsByRarity = [];
let tradeups = [];
let maxProfitability = 0;
let dataLoaded = false;
let calculationStopped = false;
let isCalculating = false;

function stopCalculation() {
    calculationStopped = true;
    isCalculating = false;
    document.getElementById('stopBtn').disabled = true;
    document.getElementById('runBtn').disabled = false;
    updateStatus('Stopped! Found: ' + tradeups.length + ' trade-ups', null);
    displayResults(tradeups);
}

function updateStatus(text, progress) {
    document.getElementById('statusText').textContent = text;
    if (progress !== null && progress !== undefined) {
        document.getElementById('progress').style.width = progress + '%';
    } else {
        document.getElementById('progress').style.width = '0%';
    }
}
function buildItemDatabase(pricesData, collectionsData) {

    // Build price map from pricesData: "BaseName (Wear)" -> {price, quantity}
    let priceMap = {};
    for (let pi = 0; pi < pricesData.length; pi++) {
        let priceItem = pricesData[pi];
        let marketHashName = priceItem.market_hash_name;
        let quantity = priceItem.quantity || 0;
        let price = priceItem.min_price / 100;
        priceMap[marketHashName] = {price: price, quantity: quantity};
    }

    // Build item database from collectionsData
    let resultItems = {};
    let allItemsWithRarity = [];

    for (let ci = 0; ci < collectionsData.length; ci++) {
        let collection = collectionsData[ci];
        if (!collection.contains) continue;

        for (let i = 0; i < collection.contains.length; i++) {
            let item = collection.contains[i];
            let baseName = item.name;
            let rarityId = item.rarity ? item.rarity.id : null;
            let rarity = {
                id: rarityId,
                name: item.rarity ? item.rarity.name : 'Consumer Grade',
                order: RARITY_ORDER[rarityId] || 0,
                color: item.rarity ? item.rarity.color : '#222'
            };
            let skinImage = item.image || null;

            // Use pre-computed float values from backend
            let floatMin = item.min_float || 0;
            let floatMax = item.max_float || 1;

            // Create item for each wear
            for (let wearName in WEAR_RANGES) {
                let marketHashName = baseName + ' (' + wearName + ')';
                let wearRange = WEAR_RANGES[wearName];

                let priceInfo = priceMap[marketHashName] || {price: 0, quantity: 0};
                let price = priceInfo.price;
                let quantity = priceInfo.quantity;

                let itemData = {
                    baseName: baseName,
                    wear: wearName,
                    wearFloatMin: Math.max(wearRange[0], floatMin),
                    wearFloatMax: Math.min(wearRange[1], floatMax),
                    collectionId: collection.id,
                    rarity: rarity,
                    price: price,
                    quantity: quantity,
                    floatMin: floatMin,
                    floatMax: floatMax,
                    marketHashName: marketHashName,
                    skinImage: skinImage
                };

                // Use unique key including collectionId to allow same item in multiple collections
                let uniqueKey = collection.id + '|' + baseName + '|' + wearName;
                resultItems[uniqueKey] = itemData;
                allItemsWithRarity.push(itemData);
            }
        }
    }

    return {matched: resultItems, all: allItemsWithRarity};
}

function groupByCollection(itemsList) {
    let groups = {};
    for (let key in itemsList) {
        let item = itemsList[key];
        if (!groups[item.collectionId]) groups[item.collectionId] = [];
        groups[item.collectionId].push(item);
    }
    return groups;
}

function combinations(array, k, maxDuplicates, limit) {
    maxDuplicates = maxDuplicates || 1;
    let n = array.length;
    let result = [];
    let count = [0];

    generate(array, k, 0, [], [], result, count, limit, n, maxDuplicates);

    return result;
}

function generate(array, k, start, prefix, usedCounts, result, count, limit, n, maxDuplicates) {
    if (limit !== null && count[0] >= limit) {
        return true;
    }

    if (k === 0) {
        result.push(prefix.slice());
        count[0]++;
        return false;
    }

    for (let i = start; i < n; i++) {
        let item = array[i];
        let currentCount = usedCounts[i] || 0;

        if (currentCount >= maxDuplicates) {
            continue;
        }

        let newPrefix = prefix.slice();
        newPrefix.push(item);

        let newUsed = usedCounts.slice();
        newUsed[i] = currentCount + 1;

        let stop = generate(array, k - 1, i, newPrefix, newUsed, result, count, limit, n, maxDuplicates);

        if (stop) {
            return true;
        }
    }

    return false;
}

function randomFloat(min, max) {
    return min + Math.random() * (max - min);
}

function calculateSingleTradeupFull(combo, isCovert) {
    isCovert = isCovert || false;
    let inputItems = combo.items;
    let numInputs = inputItems.length;
    let inputRarity = combo.inputRarity;
    let outputRarity = inputRarity + 1;

    let inputDetails = [];
    let total = 0;
    let normalizedSum = 0;

    for (let i = 0; i < inputItems.length; i++) {
        let item = inputItems[i];
        let wearRange = WEAR_RANGES[item.wear] || [0, 1];

        if (item.wearFloatMax !== undefined && item.wearFloatMin !== undefined) {
            wearRange = [item.wearFloatMax, item.wearFloatMin];
        }

        let inputFloat = Math.max(parseFloat(randomFloat(wearRange[0], (wearRange[1] + wearRange[0]) / 2).toFixed(8)), 0.001);

        let skinFloatMin = item.floatMin;
        let skinFloatMax = item.floatMax;
        let normalizedFloat = 0.5;
        if (skinFloatMax > skinFloatMin) {
            normalizedFloat = (inputFloat - skinFloatMin) / (skinFloatMax - skinFloatMin);
        }

        normalizedSum += normalizedFloat;

        inputDetails.push({
            name: item.baseName,
            wear: item.wear,
            price: item.price,
            floatMin: item.floatMin,
            floatMax: item.floatMax,
            float: inputFloat,
            normalizedFloat: parseFloat(normalizedFloat.toFixed(8)),
            skinImage: item.skinImage || null,
            rarity: item.rarity
        });
        total += item.price;
    }

    let inputValue = total * (1 - STEAM_FEE);
    let averageNormalizedFloat = normalizedSum / numInputs;

    let chance = isCovert ? 0.20 : 0.10;

    let inputCollections = [];
    for (let i = 0; i < inputItems.length; i++) {
        if (inputCollections.indexOf(inputItems[i].collectionId) < 0) {
            inputCollections.push(inputItems[i].collectionId);
        }
    }

    let higherItems = [];
    let rarerItems = allItemsByRarity[outputRarity];

    if (rarerItems) {
        for (let i = 0; i < rarerItems.length; i++) {
            if (inputCollections.indexOf(rarerItems[i].collectionId) >= 0) {
                higherItems.push(rarerItems[i]);
            }
        }
    }

    let validItems = [];
    let byBaseName = {};

    for (let i = 0; i < higherItems.length; i++) {
        let item = higherItems[i];
        let baseName = item.baseName;
        let wearName = item.wear;

        let skinFloatMin = item.floatMin;
        let skinFloatMax = item.floatMax;

        let preservedFloat = averageNormalizedFloat * (skinFloatMax - skinFloatMin) + skinFloatMin;

        let matchedWear = null;
        for (let w in WEAR_RANGES) {
            let range = WEAR_RANGES[w];
            if (preservedFloat >= range[0] && preservedFloat <= range[1]) {
                matchedWear = w;
                break;
            }
        }

        let variantWearRange = WEAR_RANGES[wearName] || [0, 1];

        let variantMin = Math.max(variantWearRange[0], skinFloatMin);
        let variantMax = Math.min(variantWearRange[1], skinFloatMax);

        if (matchedWear === wearName && preservedFloat >= variantMin && preservedFloat <= variantMax) {
            if (!byBaseName[baseName]) {
                byBaseName[baseName] = true;
                validItems.push({
                    baseName: item.baseName,
                    wear: item.wear,
                    price: item.price,
                    quantity: item.quantity,
                    floatMin: item.floatMin,
                    floatMax: item.floatMax,
                    collectionId: item.collectionId,
                    rarity: item.rarity,
                    preservedFloat: preservedFloat,
                    wearFloatMin: variantMin,
                    wearFloatMax: variantMax,
                    skinImage: item.skinImage || null
                });
            }
        }
    }

    if (validItems.length === 0) {
        return null;
    }

    let outputsByCollection = {};
    for (let i = 0; i < validItems.length; i++) {
        let colId = validItems[i].collectionId || null;
        if (!outputsByCollection[colId]) outputsByCollection[colId] = [];
        outputsByCollection[colId].push(validItems[i]);
    }

    let inputsByCollection = {};
    for (let i = 0; i < inputItems.length; i++) {
        let colId = inputItems[i].collectionId;
        inputsByCollection[colId] = (inputsByCollection[colId] || 0) + 1;
    }

    let n = numInputs;
    let outputItems = [];

    for (let i = 0; i < validItems.length; i++) {
        let output = validItems[i];
        let colId = output.collectionId || null;
        let inputsFromC = inputsByCollection[colId] || 0;
        let k_c = outputsByCollection[colId] ? outputsByCollection[colId].length : 0;

        let chancePerOutput = 0;
        if (k_c > 0) {
            chancePerOutput = (inputsFromC / (n * k_c)) * 100;
        }
        let chanceDecimal = chancePerOutput / 100;

        let outputFloat = output.preservedFloat;
        let outputPriceWithFee = output.price * (1 - STEAM_FEE);
        let expectedProfit = (outputPriceWithFee * chanceDecimal) - (inputValue * chanceDecimal);
        let expectedProfitPercent = 0;
        if (inputValue * chanceDecimal > 0) {
            expectedProfitPercent = (expectedProfit / (inputValue * chanceDecimal)) * 100;
        }

        outputItems.push({
            name: output.baseName,
            wear: output.wear,
            price: output.price,
            quantity: output.quantity || 0,
            floatMin: output.floatMin,
            floatMax: output.floatMax,
            preservedFloat: parseFloat(outputFloat.toFixed(8)),
            chance: parseFloat(chancePerOutput.toFixed(2)),
            outputValue: parseFloat(outputPriceWithFee.toFixed(2)),
            expectedProfit: parseFloat(expectedProfit.toFixed(2)),
            expectedProfitPercent: parseFloat(expectedProfitPercent.toFixed(2)),
            skinImage: (output.skinImage && output.skinImage.indexOf('community') >= 0) ? output.skinImage : null,
            rarity: output.rarity
        });
    }

    outputItems.sort(function (a, b) {
        return b.expectedProfit - a.expectedProfit;
    });

    let totalExpectedOutputWithoutFee = 0;
    for (let i = 0; i < outputItems.length; i++) {
        totalExpectedOutputWithoutFee += outputItems[i].price * (outputItems[i].chance / 100);
    }

    let totalExpectedOutput = 0;
    for (let i = 0; i < outputItems.length; i++) {
        totalExpectedOutput += outputItems[i].outputValue * (outputItems[i].chance / 100);
    }

    let outputsTotal = 0;
    for (let i = 0; i < outputItems.length; i++) {
        outputsTotal += outputItems[i].price;
    }
    let numOutputs = outputItems.length;
    let avgOutputPrice = totalExpectedOutputWithoutFee;
    let profitability = total > 0 ? (totalExpectedOutputWithoutFee / total) * 100 : 0;

    return {
        inputDetails: inputDetails,
        inputWear: inputDetails.map(function (x) {
            return x.wear;
        }).filter(function (v, i, a) {
            return a.indexOf(v) === i;
        }).join(', '),
        inputRarity: inputRarity,
        inputRarityName: inputItems[0] && inputItems[0].rarity ? inputItems[0].rarity.name : (RARITY_NAMES[inputRarity] || 'Unknown'),
        outputRarityName: validItems[0] && validItems[0].rarity ? validItems[0].rarity.name : (RARITY_NAMES[outputRarity] || 'Unknown'),
        inputTotal: parseFloat(total.toFixed(2)),
        inputValue: parseFloat(inputValue.toFixed(2)),
        averageNormalizedFloat: parseFloat(averageNormalizedFloat.toFixed(8)),
        numItems: numInputs,
        chance: parseFloat((chance * 100).toFixed(1)),
        outputsTotal: parseFloat(outputsTotal.toFixed(2)),
        numOutputs: numOutputs,
        avgOutputPrice: parseFloat(avgOutputPrice.toFixed(2)),
        profitability: parseFloat(profitability.toFixed(2)),
        possibleOutputs: outputItems
    };
}

function calculateTradeupsAsync(itemsByCollection, minProfit) {
    return new Promise(function (resolve) {
        let allTradeups = [];
        let itemsByRarity = {};
        let collectionsRarity = {};

        for (let collectionId in itemsByCollection) {
            if (BANNED_COLLECTIONS.indexOf(collectionId) >= 0) continue;
            if (USER_BANNED_COLLECTIONS.indexOf(collectionId) >= 0) continue;
            let collectionItems = itemsByCollection[collectionId];
            for (let i = 0; i < collectionItems.length; i++) {
                let item = collectionItems[i];
                let r = item.rarity.order;
                if (!itemsByRarity[r]) itemsByRarity[r] = [];
                itemsByRarity[r].push(item);

                if (!collectionsRarity[collectionId]) {
                    collectionsRarity[collectionId] = [];
                }

                if (!collectionsRarity[collectionId].includes(r)) {
                    collectionsRarity[collectionId].push(r);
                }
            }
        }

        let hasHigherOutput = {};
        for (let r = 0; r < 6; r++) {
            hasHigherOutput[r] = false;
            if (itemsByRarity[r + 1] && itemsByRarity[r + 1].length > 0) {
                hasHigherOutput[r] = true;
            }
        }

        // Build array of all tradeups to process
        let toProcess = [];

        for (let rarity in itemsByRarity) {
            let r = parseInt(rarity);
            if (ALLOWED_RARITIES.indexOf(r) < 0 || !hasHigherOutput[r]) continue;

            let rarityItems = itemsByRarity[r];
            let filteredItems = [];
            for (let i = 0; i < rarityItems.length; i++) {
                let item = rarityItems[i];

                if (!collectionsRarity[item.collectionId].includes(r + 1)) {
                    continue;
                }

                if (ALLOWED_WEARS.indexOf(item.wear) >= 0) {
                    if (item.price > 0 && item.price <= MAX_ITEM_PRICE && item.price >= MIN_ITEM_PRICE) {
                        filteredItems.push(item);
                    }
                }
            }
            if (filteredItems.length === 0) continue;

            let isCovert = r === 5;
            let requiredCount = isCovert ? 5 : 10;
            if (filteredItems.length < requiredCount) continue;

            let shuffled = filteredItems.slice().sort(function () {
                return Math.random() - 0.5;
            });
            let combos = combinations(shuffled, requiredCount, SETTINGS_MAX_DUPLICATES, SETTINGS_COMBO_LIMIT);

            for (let ci = 0; ci < combos.length; ci++) {
                toProcess.push({
                    items: combos[ci],
                    inputRarity: r,
                    isCovert: isCovert
                });
            }
        }

        // Now process them with setTimeout
        let index = 0;
        let lastProgressUpdate = 0;

        function processBatch() {
            let batchSize = 1000;
            for (let i = 0; i < batchSize && index < toProcess.length && !calculationStopped; i++) {
                let job = toProcess[index];
                let tradeup = calculateSingleTradeupFull({
                    items: job.items,
                    inputRarity: job.inputRarity
                }, job.isCovert);

                if (tradeup && tradeup.possibleOutputs && tradeup.possibleOutputs.length > 0) {
                    // Skip tradeups with low quantity outputs if option is enabled
                    if (SKIP_LOW_QUANTITY) {
                        let hasLowQuantity = tradeup.possibleOutputs.some(function (o) {
                            return (o.quantity || 0) <= LOW_QUANTITY_THRESHOLD;
                        });
                        if (hasLowQuantity) {
                            index++;
                            continue;
                        }
                    }
                    if (tradeup.inputTotal > 0 && tradeup.inputTotal <= MAX_CONTRACT_PRICE) {
                        if (tradeup.profitability > maxProfitability) {
                            maxProfitability = tradeup.profitability;
                        }
                        if (tradeup.profitability >= (minProfit || 0)) {
                            allTradeups.push(tradeup);
                            // Keep only top 50 by profitability
                            allTradeups.sort(function (a, b) {
                                return b.profitability - a.profitability;
                            });
                            if (allTradeups.length > 50) {
                                allTradeups.length = 50;
                            }
                        }
                    }
                }
                index++;
            }

            let progressPercent = Math.round(index / toProcess.length * 100);
            document.getElementById('statusText').textContent = 'Processing: ' + index + '/' + toProcess.length + ' (' + progressPercent + '%)';
            document.getElementById('progress').style.width = progressPercent + '%';

            if (index < toProcess.length && !calculationStopped) {
                setTimeout(processBatch, 0);
            } else if (calculationStopped) {
                if (isCalculating) {
                    isCalculating = false;
                    document.getElementById('stopBtn').disabled = true;
                    btn.disabled = false;
                    updateStatus('Stopped! Found: ' + allTradeups.length + ' trade-ups', null);
                    displayResults(allTradeups);
                }
                resolve(allTradeups);
            } else {
                resolve(allTradeups);
            }
        }

        document.getElementById('statusText').textContent = 'Processing: 0/' + toProcess.length;
        setTimeout(processBatch, 10);
    });
}

function displayResults(tradeups) {
    let resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = '';

    if (tradeups.length === 0) {
        resultsDiv.innerHTML = '<p style="text-align:center;">No trade-ups found</p>';
        return;
    }

    let topTradeups = tradeups.slice(0, 50);

    for (let i = 0; i < topTradeups.length; i++) {
        let t = topTradeups[i];
        let card = document.createElement('div');
        card.className = 'tradeup-card';

        let profitClass = t.profitability >= 100 ? 'positive' : 'negative';

        let html = '<h3>#' + (i + 1) + ' - ' + t.inputRarityName + ' → ' + t.outputRarityName + '</h3>';
        html += '<div class="tradeup-stats">';
        html += '<div class="stat"><div class="stat-value">$' + t.inputTotal + '</div><div class="stat-label">Cost</div></div>';
        html += '<div class="stat"><div class="stat-value">$' + t.avgOutputPrice + '</div><div class="stat-label">Avg Return</div></div>';
        html += '<div class="stat"><div class="stat-value">' + t.numOutputs + '</div><div class="stat-label">Outputs</div></div>';
        html += '<div class="stat"><div class="stat-value ' + profitClass + '">' + t.profitability + '%</div><div class="stat-label">Profit</div></div>';
        html += '<div class="stat"><div class="stat-value">' + (t.averageNormalizedFloat ? parseFloat(t.averageNormalizedFloat).toFixed(8) : '-') + '</div><div class="stat-label">Avg Float</div></div>';
        html += '</div>';

        // Inputs (left) + Outputs (right) - both visible
        html += '<div class="two-columns">';

        // LEFT COLUMN - Inputs
        html += '<div class="column">';
        html += '<h4>Inputs (' + t.numItems + 'x) - $' + t.inputTotal + '</h4>';
        html += '<div class="items-grid">';
        let inputs = t.inputDetails;
        let placeholderImg = 'https://steamcdn-a.akamaihd.net/steam/apps/252490/capsule_231x87.jpg';
        for (let j = 0; j < inputs.length; j++) {
            let inp = inputs[j];
            let imgUrl = inp.skinImage || placeholderImg;
            let floatDisplay = inp.float ? 'float: ' + inp.float.toFixed(8) + ' (' + inp.floatMin.toFixed(2) + ' - ' + inp.floatMax.toFixed(2) + ')' : inp.wear;
            let nameWithWear = inp.name + ' (' + inp.wear + ')';
            html += '<div class="skin-card">';
            html += '<div class="skin-img-wrapper" style="background-color: ' + (inp.rarity && inp.rarity.color ? inp.rarity.color : '#222') + '">';
            html += '<img src="' + imgUrl + '" alt="' + inp.name + '" onerror="this.src=\'' + placeholderImg + '\'">';
            html += '</div>';
            html += '<div class="name">' + nameWithWear + '</div>';
            html += '<div class="price">$' + inp.price + '</div>';
            html += '<div class="wear">' + floatDisplay + '</div>';
            html += '</div>';
        }
        html += '</div>';
        html += '</div>';

        // RIGHT COLUMN - All Outputs
        html += '<div class="column">';
        html += '<h4>Outputs (' + t.numOutputs + ') - $' + t.outputsTotal + '</h4>';
        html += '<div class="items-grid">';
        let outputs = t.possibleOutputs;
        for (let j = 0; j < outputs.length; j++) {
            let out = outputs[j];
            let outImgUrl = out.skinImage || placeholderImg;
            let floatDisplay2 = out.preservedFloat ? 'float: ' + parseFloat(out.preservedFloat).toFixed(8) + ' (' + out.floatMin.toFixed(2) + ' - ' + out.floatMax.toFixed(2) + ')' : out.wear;
            let nameWithWear2 = out.name + ' (' + out.wear + ')';
            html += '<div class="skin-card">';
            html += '<div class="skin-img-wrapper" style="background-color: ' + (out.rarity && out.rarity.color ? out.rarity.color : '#222') + '">';
            html += '<img src="' + outImgUrl + '" alt="' + out.name + '" onerror="this.src=\'' + placeholderImg + '\'">';
            html += '</div>';
            html += '<div class="name">' + nameWithWear2 + '</div>';
            html += '<div class="price">$' + out.price + '</div>';
            html += '<div class="chance">chance: ' + out.chance + '%</div>';
            html += '<div class="wear">' + floatDisplay2 + '</div>';
            html += '</div>';
        }
        html += '</div>';
        html += '</div>';

        html += '</div>';

        card.innerHTML = html;
        resultsDiv.appendChild(card);
    }
}

function getFloatImageSuffix(floatMin, floatMax) {
    let avg = (floatMin + floatMax) / 2;
    if (avg <= 0.07) return 'fn';
    if (avg <= 0.15) return 'mw';
    if (avg <= 0.38) return 'ft';
    if (avg <= 0.45) return 'ww';
    return 'bs';
}

function getSkinImageUrl(name, floatMin, floatMax) {
    // Placeholder - proper images need Steam API with market_hash_name
    let wear = getFloatImageSuffix(floatMin, floatMax);
    return 'https://steamcdn-a.akamaihd.net/steam/apps/252490/capsule_231x87.jpg';
}

let popupTimeout = null;
let currentCollectionId = null;
let hidePopupTimeout = null;

function populateBannedCollections() {
    let container = document.getElementById('bannedCollections');
    container.innerHTML = '';
    for (let i = 0; i < collections.length; i++) {
        let col = collections[i];
        // Skip hardcoded banned collections - they're always banned
        if (BANNED_COLLECTIONS.indexOf(col.id) >= 0) continue;
        let label = document.createElement('label');
        label.style.cssText = 'display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px; transition: background 0.2s;';
        label.dataset.collectionId = col.id;
        let checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = col.id;
        if (USER_BANNED_COLLECTIONS.indexOf(col.id) >= 0) {
            checkbox.checked = true;
            label.classList.add('excluded');
        }
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(col.name || col.id));
        // Hover effect
        label.onmouseenter = function() {
            this.style.background = '#1a4a7a';
            let rect = this.getBoundingClientRect();
            let popup = document.getElementById('collectionPopup');
            currentCollectionId = col.id;
            // Clear any pending hide
            if (hidePopupTimeout) clearTimeout(hidePopupTimeout);
            if (popupTimeout) clearTimeout(popupTimeout);
            popupTimeout = setTimeout(function() {
                popup.style.display = 'block';
                popup.style.top = rect.top + 'px';
                popup.style.left = (rect.right + 5) + 'px';
            }, 500);
        };
        label.onmouseleave = function(e) {
            this.style.background = 'transparent';
            // Check if mouse is moving towards popup (to the right)
            let popup = document.getElementById('collectionPopup');
            let popupRect = popup.getBoundingClientRect();
            // Don't hide if mouse is over or near popup
            if (hidePopupTimeout) clearTimeout(hidePopupTimeout);
            hidePopupTimeout = setTimeout(function() {
                popup.style.display = 'none';
            }, 200);
        };
        // Toggle excluded class
        checkbox.onchange = function() {
            if (this.checked) {
                label.classList.add('excluded');
            } else {
                label.classList.remove('excluded');
            }
        };
        container.appendChild(label);
    }
}

// Handle popup hover
let popup = document.getElementById('collectionPopup');
popup.onmouseenter = function() {
    // Cancel any pending hide when mouse enters popup
    if (hidePopupTimeout) clearTimeout(hidePopupTimeout);
    if (popupTimeout) clearTimeout(popupTimeout);
};
popup.onmouseleave = function(e) {
    // Check if mouse is going back to a label
    this.style.display = 'none';
};
popup.onclick = function() {
    this.style.display = 'none';
    if (currentCollectionId) {
        showCollectionItems(currentCollectionId);
    }
};

function populateCollectionSelect(filter) {
    let select = document.getElementById('collectionItemsSelect');
    select.innerHTML = '<option value="">Select collection...</option>';
    let filterLower = filter ? filter.toLowerCase() : '';
    for (let i = 0; i < collections.length; i++) {
        let c = collections[i];
        let collectionNameMatch = c.name && c.name.toLowerCase().indexOf(filterLower) !== -1;
        let itemMatch = false;
        if (filterLower && c.contains) {
            for (let j = 0; j < c.contains.length; j++) {
                if (c.contains[j].name && c.contains[j].name.toLowerCase().indexOf(filterLower) !== -1) {
                    itemMatch = true;
                    break;
                }
            }
        }
        if (filter && !collectionNameMatch && !itemMatch) {
            continue;
        }
        let opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name || c.id;
        select.appendChild(opt);
    }
}

function onCollectionSearch(query) {
    populateCollectionSelect(query);
    let select = document.getElementById('collectionItemsSelect');
    if (select.options.length > 1) {
        select.value = select.options[1].value;
        showCollectionItems(select.value);
    } else {
        document.getElementById('collectionItemsList').innerHTML = '<p style="color: #666; text-align: center;">No collections found</p>';
        document.getElementById('collectionCratesInfo').style.display = 'none';
    }
}

function getWearsForFloatRange(floatMin, floatMax) {
    const wears = [];
    for (let wearName in WEAR_RANGES) {
        let range = WEAR_RANGES[wearName];
        // Check if there's any overlap between the item's float range and the wear range
        if (floatMin < range[1] && floatMax > range[0]) {
            wears.push(wearName);
        }
    }
    return wears;
}

function getWearColor(wearName) {
    const colors = {
        'Factory New': '#00ff88',
        'Minimal Wear': '#ffff00',
        'Field-Tested': '#ffa500',
        'Well-Worn': '#ff6b6b',
        'Battle-Scarred': '#8b0000'
    };
    return colors[wearName] || '#666';
}

function showCollectionItems(collectionId) {
    if (!collectionId) return;
    let collection = collections.find(function(c) { return c.id === collectionId; });
    if (!collection) return;
    let select = document.getElementById('collectionItemsSelect');
    if (select.options.length <= 1) {
        populateCollectionSelect();
    }
    select.value = collectionId;

    let cratesInfo = document.getElementById('collectionCratesInfo');
    cratesInfo.innerHTML = '';
    if (collection.crates && collection.crates.length > 0) {
        for (let i = 0; i < collection.crates.length; i++) {
            let crate = collection.crates[i];
            let div = document.createElement('div');
            div.style.display = 'flex';
            div.style.alignItems = 'center';
            div.style.gap = '8px';
            let img = document.createElement('img');
            img.src = crate.image || 'https://steamcdn-a.akamaihd.net/steam/apps/252490/capsule_231x87.jpg';
            img.alt = crate.name;
            img.style.width = '50px';
            img.style.height = '50px';
            img.style.objectFit = 'contain';
            let name = document.createElement('span');
            name.style.fontSize = '13px';
            name.style.color = '#eaeaea';
            name.textContent = crate.name;
            div.appendChild(img);
            div.appendChild(name);
            cratesInfo.appendChild(div);
        }
        cratesInfo.style.display = 'flex';
    } else {
        cratesInfo.style.display = 'none';
    }

    let list = document.getElementById('collectionItemsList');
    list.innerHTML = '';
        if (collection.contains && collection.contains.length > 0) {
            for (let i = 0; i < collection.contains.length; i++) {
                let item = collection.contains[i];
                let div = document.createElement('div');
                div.className = 'collection-item';
                div.style.background = (item.rarity && item.rarity.color) ? item.rarity.color + '33' : '#0f3460';

                // LEFT: Image (larger)
                let img = document.createElement('img');
                img.src = item.image || 'https://steamcdn-a.akamaihd.net/steam/apps/252490/capsule_231x87.jpg';
                img.alt = item.name;

                // RIGHT: Name + Wear + Float chart
                let rightSection = document.createElement('div');
                rightSection.className = 'collection-item-right-section';

                let name = document.createElement('div');
                name.className = 'collection-item-name';
                name.textContent = item.name;
                rightSection.appendChild(name);

                // Wear name (if available)
                if (item.rarity && item.rarity.name) {
                    let wearDiv = document.createElement('div');
                    wearDiv.className = 'collection-item-rarity';
                    wearDiv.textContent = item.rarity.name;
                    wearDiv.style.background = item.rarity.color + '66';
                    wearDiv.style.color = item.rarity.color;
                    rightSection.appendChild(wearDiv);
                }

                // Float range chart - only if item has float data
                let floatMin = item.min_float;
                let floatMax = item.max_float;
                let floatInfo = null;

                if (floatMin !== undefined && floatMin !== null && floatMax !== undefined && floatMax !== null) {
                    floatInfo = document.createElement('div');
                    floatInfo.className = 'float-info';

                    // Float range text
                    let floatText = document.createElement('div');
                    floatText.className = 'float-text';
                    floatText.textContent = 'Float: ' + parseFloat(floatMin).toFixed(3) + ' - ' + parseFloat(floatMax).toFixed(3);
                    floatInfo.appendChild(floatText);

                    // Visual float range bar (0 to 1) with proportional wear segments
                    let rangeBar = document.createElement('div');
                    rangeBar.className = 'float-range-bar';

                    let wearBoundaries = [
                        {name: 'Factory New', short: 'FN', start: 0, end: 0.07},
                        {name: 'Minimal Wear', short: 'MW', start: 0.07, end: 0.15},
                        {name: 'Field-Tested', short: 'FT', start: 0.15, end: 0.38},
                        {name: 'Well-Worn', short: 'WW', start: 0.38, end: 0.45},
                        {name: 'Battle-Scarred', short: 'BS', start: 0.45, end: 1.0}
                    ];

                    let applicableWears = getWearsForFloatRange(floatMin, floatMax);

                    for (let wear of wearBoundaries) {
                        let segment = document.createElement('div');
                        segment.className = 'float-range-segment';
                        // Set flex proportional to the range width
                        let rangeWidth = wear.end - wear.start;
                        segment.style.flex = rangeWidth * 100 + '';
                        segment.style.background = applicableWears.includes(wear.name) ? getWearColor(wear.name) : 'transparent';

                        let label = document.createElement('span');
                        label.textContent = wear.short;
                        label.className = applicableWears.includes(wear.name) ? 'active' : 'inactive';
                        segment.appendChild(label);

                        // Add boundary marker (vertical line) except for the first segment
                        if (wear.start > 0) {
                            let boundary = document.createElement('div');
                            boundary.style.position = 'absolute';
                            boundary.style.left = '0';
                            boundary.style.top = '0';
                            boundary.style.width = '2px';
                            boundary.style.height = '100%';
                            boundary.style.background = 'rgba(255, 255, 255, 0.5)';
                            boundary.style.zIndex = '5';
                            segment.appendChild(boundary);
                        }

                        rangeBar.appendChild(segment);
                    }

                    // Highlight the item's actual float range
                    let rangeHighlight = document.createElement('div');
                    rangeHighlight.className = 'float-range-highlight';
                    rangeHighlight.style.left = (floatMin * 100) + '%';
                    rangeHighlight.style.width = ((floatMax - floatMin) * 100) + '%';
                    rangeBar.appendChild(rangeHighlight);

                    floatInfo.appendChild(rangeBar);

                    // Labels for 0 and 1
                    let rangeLabels = document.createElement('div');
                    rangeLabels.className = 'float-range-labels';
                    rangeLabels.innerHTML = '<span>0</span><span>1</span>';

                    floatInfo.appendChild(rangeLabels);
                }

                if (floatInfo) {
                    rightSection.appendChild(floatInfo);
                }
                div.appendChild(img);
                div.appendChild(rightSection);
                list.appendChild(div);
        }
    } else {
        list.innerHTML = '<p style="color: #666; text-align: center;">No items in this collection</p>';
    }
    document.getElementById('collectionItemsModal').classList.add('show');
}

function onCollectionSelectChange(collectionId) {
    if (collectionId) {
        showCollectionItems(collectionId);
    }
}

function openCollectionsModal() {
    populateCollectionSelect();
    let select = document.getElementById('collectionItemsSelect');
    if (select.options.length > 1) {
        select.value = select.options[1].value;
        showCollectionItems(select.value);
    }
    document.getElementById('collectionSearchInput').value = '';
    document.getElementById('collectionItemsModal').classList.add('show');
}

function closeCollectionItemsModal() {
    document.getElementById('collectionItemsModal').classList.remove('show');
}

// Close modal on click outside
document.getElementById('collectionItemsModal').onclick = function(e) {
    if (e.target === this) {
        closeCollectionItemsModal();
    }
};

// Hide popup on scroll
document.getElementById('bannedCollections').addEventListener('scroll', function() {
    let popup = document.getElementById('collectionPopup');
    popup.style.display = 'none';
    if (popupTimeout) clearTimeout(popupTimeout);
});

function loadData() {
    return new Promise(function (resolve, reject) {
        if (dataLoaded) {
            updateStatus('Data ready - click Calculate');
            populateBannedCollections();
            resolve();
            return;
        }
        updateStatus('Loading data...');

        fetch('/api/data')
            .then(function (response) {
                return response.json();
            })
            .then(function (data) {
                if (data.error) throw new Error(data.error);

                prices = data.prices;
                collections = data.collections;
                dataLoaded = true;

                populateBannedCollections();

                updateStatus('Loaded: ' + prices.length + ' prices, ' + collections.length + ' collections - click Calculate');
                resolve();
            })
            .catch(function (e) {
                updateStatus('Error: ' + e.message);
                reject(e);
            });
    });
}

function refreshData() {
    updateStatus('Refreshing data...');
    fetch('/api/data')
        .then(function (r) {
            return r.json();
        })
        .then(function (data) {
            prices = data.prices;
            collections = data.collections;
            dataLoaded = true;
            populateBannedCollections();
            updateStatus('Loaded: ' + prices.length + ' prices, ' + collections.length + ' collections - click Calculate');
        })
        .catch(function (e) {
            updateStatus('Error: ' + e.message);
        });
}

function getSettingsFromUI() {
    let rarityCheckboxes = document.querySelectorAll('#rarityCheckboxes input[type="checkbox"]:checked');
    ALLOWED_RARITIES = [];
    for (let i = 0; i < rarityCheckboxes.length; i++) {
        ALLOWED_RARITIES.push(parseInt(rarityCheckboxes[i].value));
    }

    let wearCheckboxes = document.querySelectorAll('#wearCheckboxes input[type="checkbox"]:checked');
    ALLOWED_WEARS = [];
    for (let i = 0; i < wearCheckboxes.length; i++) {
        ALLOWED_WEARS.push(wearCheckboxes[i].value);
    }

    SETTINGS_MAX_DUPLICATES = parseInt(document.getElementById('maxDuplicates').value);
    SETTINGS_COMBO_LIMIT = parseInt(document.getElementById('comboLimit').value);

    STEAM_FEE = parseFloat(document.getElementById('steamFee').value) / 100;
    MAX_ITEM_PRICE = parseFloat(document.getElementById('maxItemPrice').value);
    MIN_ITEM_PRICE = parseFloat(document.getElementById('minItemPrice').value);
    MAX_CONTRACT_PRICE = parseFloat(document.getElementById('maxContractPrice').value);
    MIN_PROFITABILITY = parseFloat(document.getElementById('minProfitability').value);
    SKIP_LOW_QUANTITY = document.getElementById('skipLowQuantity').checked;
    LOW_QUANTITY_THRESHOLD = parseInt(document.getElementById('lowQuantityThreshold').value) || 1;

    let bannedSelect = document.getElementById('bannedCollections');
    USER_BANNED_COLLECTIONS = [];
    let checkboxes = bannedSelect.querySelectorAll('input[type="checkbox"]:checked');
    for (let i = 0; i < checkboxes.length; i++) {
        USER_BANNED_COLLECTIONS.push(checkboxes[i].value);
    }

    saveSettingsToStorage();
}

function saveSettingsToStorage() {
    let settings = {
        rarities: ALLOWED_RARITIES,
        wears: ALLOWED_WEARS,
        maxDuplicates: SETTINGS_MAX_DUPLICATES,
        comboLimit: SETTINGS_COMBO_LIMIT,
        steamFee: document.getElementById('steamFee').value,
        maxItemPrice: document.getElementById('maxItemPrice').value,
        minItemPrice: document.getElementById('minItemPrice').value,
        maxContractPrice: document.getElementById('maxContractPrice').value,
        minProfitability: document.getElementById('minProfitability').value,
        autoCalc: document.getElementById('autoCalc').checked,
        skipLowQuantity: document.getElementById('skipLowQuantity').checked,
        lowQuantityThreshold: document.getElementById('lowQuantityThreshold').value,
        bannedCollections: USER_BANNED_COLLECTIONS
    };
    localStorage.setItem('tradeupSettings', JSON.stringify(settings));
}

function loadSettingsFromStorage() {
    let saved = localStorage.getItem('tradeupSettings');
    if (!saved) return;

    try {
        let settings = JSON.parse(saved);

        if (settings.rarities) {
            document.querySelectorAll('#rarityCheckboxes input[type="checkbox"]').forEach(function (cb) {
                cb.checked = settings.rarities.indexOf(parseInt(cb.value)) !== -1;
            });
        }

        if (settings.wears) {
            document.querySelectorAll('#wearCheckboxes input[type="checkbox"]').forEach(function (cb) {
                cb.checked = settings.wears.indexOf(cb.value) !== -1;
            });
        }

        if (settings.maxDuplicates) {
            document.getElementById('maxDuplicates').value = settings.maxDuplicates;
            document.getElementById('maxDupInput').value = settings.maxDuplicates;
            document.getElementById('maxDupValue').textContent = settings.maxDuplicates;
        }

        if (settings.comboLimit) {
            document.getElementById('comboLimit').value = settings.comboLimit;
            document.getElementById('comboLimitInput').value = settings.comboLimit;
            document.getElementById('limitValue').textContent = settings.comboLimit;
        }

        if (settings.steamFee) document.getElementById('steamFee').value = settings.steamFee;
        if (settings.maxItemPrice) document.getElementById('maxItemPrice').value = settings.maxItemPrice;
        if (settings.minItemPrice) document.getElementById('minItemPrice').value = settings.minItemPrice;
        if (settings.maxContractPrice) document.getElementById('maxContractPrice').value = settings.maxContractPrice;
        if (settings.minProfitability) document.getElementById('minProfitability').value = settings.minProfitability;
        if (settings.autoCalc !== undefined) document.getElementById('autoCalc').checked = settings.autoCalc;
        if (settings.skipLowQuantity !== undefined) {
            SKIP_LOW_QUANTITY = settings.skipLowQuantity;
            document.getElementById('skipLowQuantity').checked = settings.skipLowQuantity;
        }
        if (settings.lowQuantityThreshold !== undefined) {
            LOW_QUANTITY_THRESHOLD = parseInt(settings.lowQuantityThreshold);
            document.getElementById('lowQuantityThreshold').value = settings.lowQuantityThreshold;
        }
        if (settings.bannedCollections !== undefined) {
            USER_BANNED_COLLECTIONS = settings.bannedCollections;
            // Sync UI if collections already loaded
            if (collections.length > 0) {
                populateBannedCollections();
            }
        }
    } catch (e) {
        console.error('Failed to load settings:', e);
    }
}

loadSettingsFromStorage();

// Auto-load data on page load
loadData();

let SETTINGS_MAX_DUPLICATES = 3;
let SETTINGS_COMBO_LIMIT = 10000;

function runCalculation() {
    const btn = document.getElementById('runBtn');
    const stopBtn = document.getElementById('stopBtn');
    btn.disabled = true;
    stopBtn.disabled = false;
    calculationStopped = false;
    isCalculating = true;
    tradeups = [];
    maxProfitability = 0;

    getSettingsFromUI();

    loadData()
        .then(function () {
            updateStatus('Building item database...');
            let dbResult = buildItemDatabase(prices, collections);
            items = dbResult.matched;

            let itemsByCollection = groupByCollection(items);

            allItemsByRarity = {};
            for (let key in items) {
                let item = items[key];
                let r = item.rarity.order || 0;
                if (!allItemsByRarity[r]) allItemsByRarity[r] = [];
                allItemsByRarity[r].push(item);
            }

            updateStatus('Calculating trade-ups...', 0);

            calculateTradeupsAsync(itemsByCollection, MIN_PROFITABILITY)
                .then(function (resultTradeups) {
                    tradeups = resultTradeups;
                    isCalculating = false;
                    document.getElementById('stopBtn').disabled = true;
                    updateStatus('Found: ' + tradeups.length + ' trade-ups', 100);
                    displayResults(tradeups);
                    btn.disabled = false;

                    if (tradeups.length > 0) {
                        document.getElementById('autoCalc').checked = false;
                        updateStatus('Found: ' + tradeups.length + ' trade-ups - Auto-calc disabled.', 100);
                    } else if (document.getElementById('autoCalc').checked && !calculationStopped) {
                        setTimeout(function () {
                            runCalculation();
                        }, 300);
                    }
                });
        })
        .catch(function (e) {
            isCalculating = false;
            document.getElementById('stopBtn').disabled = true;
            btn.disabled = false;
        });
}

function downloadResults() {
    if (tradeups.length === 0) {
        alert('No results to download');
        return;
    }

    let dataStr = JSON.stringify(tradeups.slice(0, 50), null, 2);
    let blob = new Blob([dataStr], {type: 'application/json'});
    let url = URL.createObjectURL(blob);
    let a = document.createElement('a');
    a.href = url;
    a.download = 'tradeups.json';
    a.click();
    URL.revokeObjectURL(url);
}

window.onerror = function (msg, url, line, col, error) {
    updateStatus('Error: ' + msg);
};
