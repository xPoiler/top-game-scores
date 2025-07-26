// Fetches the top games from SteamSpy and ranks them by combined
// Metacritic and user scores. Results are displayed on the page.

const CORS_PROXY = 'https://thingproxy.freeboard.io/fetch/';

// Utility to fetch JSON with error handling.
async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

// Compute user score percentage from positive/negative review counts.
function computeUserScore(positive, negative) {
  const total = positive + negative;
  if (total === 0) return null;
  return (positive / total) * 100;
}

async function getGameData(appid) {
  // Fetch game details (including Metacritic score).
  const detailsUrl = `${CORS_PROXY}https://store.steampowered.com/api/appdetails?appids=${appid}`;
  const detailsData = await fetchJson(detailsUrl);
  const detailEntry = detailsData[appid];
  if (!detailEntry || !detailEntry.success || !detailEntry.data) {
    return null;
  }
  const data = detailEntry.data;
  const metacriticScore = data.metacritic && typeof data.metacritic.score === 'number' ? data.metacritic.score : null;
  // Skip games without Metacritic score because we cannot combine them.
  if (metacriticScore === null) return null;
  // Fetch user review summary.
  const reviewsUrl = `${CORS_PROXY}https://store.steampowered.com/appreviews/${appid}?json=1&purchase_type=all&language=all`;
  const reviewsData = await fetchJson(reviewsUrl);
  if (!reviewsData || !reviewsData.query_summary) return null;
  const positive = reviewsData.query_summary.total_positive;
  const negative = reviewsData.query_summary.total_negative;
  const userScore = computeUserScore(positive, negative);
  if (userScore === null) return null;
  // Combined score (simple sum) used for ranking. A higher combined score means a higher ranking.
  const combined = metacriticScore + userScore;
  return {
    appid,
    name: data.name,
    metacriticScore,
    userScore,
    combined,
    image: data.header_image,
    url: `https://store.steampowered.com/app/${appid}`,
  };
}

async function loadTopGames() {
  const listContainer = document.getElementById('game-list');
  // Show loading message.
  listContainer.innerHTML = '<p>Loading data… please wait.</p>';
  try {
    // Get top games list from SteamSpy.
    const topUrl = `${CORS_PROXY}https://steamspy.com/api.php?request=top100in2weeks`;
    const topData = await fetchJson(topUrl);
    const games = Object.values(topData);
    // Limit to first 60 games to reduce network load while still capturing most popular titles.
    const candidates = games.slice(0, 60);
    const results = [];
    // Iterate sequentially to avoid spamming the API too quickly.
    for (const game of candidates) {
      try {
        const info = await getGameData(game.appid);
        if (info) {
          results.push(info);
        }
      } catch (err) {
        console.error(`Error processing app ${game.appid}:`, err);
      }
    }
    if (results.length === 0) {
      listContainer.innerHTML = '<p>No games with both Metacritic and user scores were found.</p>';
      return;
    }
    // Sort descending by combined score and take top 10.
    results.sort((a, b) => b.combined - a.combined);
    const top10 = results.slice(0, 10);
    // Build the HTML for each game card.
    listContainer.innerHTML = '';
    for (const game of top10) {
      const card = document.createElement('div');
      card.className = 'game-card';
      card.innerHTML = `
        <img src="${game.image}" alt="${game.name}" />
        <div class="game-content">
          <h2><a href="${game.url}" target="_blank" rel="noopener noreferrer">${game.name}</a></h2>
          <div class="scores">
            <span class="metacritic">Metacritic: ${game.metacriticScore}</span>
            <span class="user-score">User: ${game.userScore.toFixed(1)}%</span>
          </div>
        </div>
      `;
      listContainer.appendChild(card);
    }
  } catch (error) {
    console.error('Error fetching game list:', error);
    listContainer.innerHTML = '<p>Sorry, there was an error loading the data.</p>';
  }
}

window.addEventListener('DOMContentLoaded', loadTopGames);