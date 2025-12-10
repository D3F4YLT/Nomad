const searchInput = document.getElementById('search');
const cards = document.querySelectorAll('.card');

searchInput.addEventListener('input', () => {
  const query = searchInput.value.toLowerCase();
  cards.forEach(card => {
    const title = card.querySelector('h2').textContent.toLowerCase();
    if (title.includes(query)) {
      card.style.display = 'block';
    } else {
      card.style.display = 'none';
    }
  });
});
