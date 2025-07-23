fetch('https://api.github.com/users/Chuckleberry-Finn')
.then(response => response.json())
.then(user => {
  const container = document.getElementById('github-profile');
  container.innerHTML = `
    <div style="text-align: center; color: white;">
      <img src="${user.avatar_url}" alt="${user.login}" style="width: 120px; border-radius: 50%;"/>
      <h2 style="margin: 0.5em 0 0.2em;">${user.name || user.login}</h2>
      <p>${user.bio || ''}</p>
      <p>${user.followers} followers • ${user.following} following</p>
      <a href="${user.html_url}" target="_blank" style="color: #58a6ff;">View on GitHub</a>
    </div>`;
})
.catch(err => {
  document.getElementById('github-profile').innerHTML = 'Failed to load profile.';
  console.error(err);
});
