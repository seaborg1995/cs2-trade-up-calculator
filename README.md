# CS2 Trade-Up Calculator

A web-based calculator for Counter-Strike 2 (CS2) trade-up contracts. This tool helps you find profitable trade-up combinations by analyzing market prices, collections, and float values.

## Features

- **Trade-Up Calculation**: Automatically calculates profitable trade-up contracts
- **Multiple Rarity Support**: Filter inputs by rarity (Consumer, Industrial, Mil-Spec, Restricted, Classified, Covert)
- **Wear Filtering**: Select which wear conditions to include (Factory New, Minimal Wear, Field-Tested, Well-Worn, Battle-Scarred)
- **Real-Time Pricing**: Fetches live prices from CSFloat API
- **Float Cap Support**: Handles skin float ranges from ByMykel's CSGO-API
- **Extraordinary Items**: Automatically includes knives and gloves from collections
- **Ban Collections**: Exclude specific collections from calculations
- **Low Quantity Filter**: Skip items with low market quantity (≤1)
- **Auto-Calculation**: Automatically re-calculate when settings change
- **Settings Persistence**: Saves your preferences to localStorage
- **Export Results**: Download trade-up results as JSON

## Prerequisites

- Node.js (v14 or higher)
- Internet connection (for fetching prices and collections data)

## Installation

1. Clone or download this repository
2. Install dependencies (if any):
   ```bash
   npm install
   ```

## Usage

### Starting the Server

Run the Node.js server:
```bash
node server.js
```

The server will start on `http://localhost:3001`

### Using the Calculator

1. Open your browser and navigate to `http://localhost:3001`
2. Click **Refresh Data** to fetch the latest prices and collections
3. Configure your settings:
   - **Rarity**: Select which rarities to use as inputs
   - **Wear**: Select allowed wear conditions
   - **Calculation Options**: Set max duplicates, combination limit
   - **Parameters**: Adjust Steam fee, price ranges, min profit
   - **Skip Low Quantity**: Enable to filter out items with quantity ≤1
4. Click **Calculate Trade-ups** to start the calculation
5. View results sorted by profitability
6. Optionally download results as JSON

### Settings

- **Max Duplicates**: Maximum number of duplicate items in a trade-up (1-10)
- **Combination Limit**: Maximum number of combinations to process (10-1,000,000)
- **Steam Fee**: Steam transaction fee percentage (default: 2%)
- **Max Item Price**: Maximum price for individual items
- **Min Item Price**: Minimum price for individual items
- **Max Contract**: Maximum total cost of a trade-up contract
- **Min Profit**: Minimum profitability percentage to include in results
- **Skip Low Quantity**: When enabled, filters out items with quantity ≤1

## Data Sources

- **Prices**: [CSFloat API](https://csfloat.com/api/v1/listings/price-list)
- **Collections**: [ByMykel's CSGO-API](https://github.com/ByMykel/CSGO-API)
- **Float Caps**: Also from ByMykel's CSGO-API (skins.json)

## File Structure

```
cs2-tradeup/
├── server.js           # Node.js server handling data fetching and caching
├── tradeup.html       # Main web interface
└── README.md
```

## How It Works

1. **Server** (`server.js`):
   - Fetches prices from CSFloat API
   - Fetches collections and skins data from GitHub APIs
   - Processes extraordinary items (knives/gloves) and adds them to appropriate collections
   - Caches data for 1 hour to reduce API calls
   - Serves the HTML interface

2. **Frontend** (`tradeup.html`):
   - Builds item database from collections data
   - Filters items based on user settings
   - Generates all possible trade-up combinations
   - Calculates profitability using Monte Carlo simulation
   - Displays results with input/output items and statistics

## Configuration

### Banned Collections

Edit the `BANNED_COLLECTIONS` array in `server.js` to exclude specific collections:

```javascript
const BANNED_COLLECTIONS = ["collection-set-xpshop-wpn-01"];
```

### Extraordinary Items

The server automatically processes items with `rarity_ancient` (knives and gloves) and adds them to collections that have matching crate IDs.

## Caching

Data is cached in `var/tradeup_cache.json` for 1 hour. To force a refresh, click **Refresh Data** in the web interface or restart the server.

## Browser Compatibility

- Chrome/Chromium (recommended)
- Firefox
- Edge
- Safari

## License

MIT License.

## Contributing

Feel free to submit issues and pull requests!

## Acknowledgments

- [ByMykel's CSGO-API](https://github.com/ByMykel/CSGO-API) for collections and skins data
- [CSFloat](https://csfloat.com) for price data
