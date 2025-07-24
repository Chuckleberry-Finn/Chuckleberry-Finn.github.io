fetch('https://api.github.com/users/Chuckleberry-Finn')
.then(response => response.json())
.then(user => {
  const container = document.getElementById('github-profile');
  container.innerHTML = `
    <div style="text-align: center; color: white;">
      <img src="${user.avatar_url}" alt="${user.login}" style="width: 120px; border-radius: 50%;"/>
      <h2 style="margin: 0.5em 0 0.2em; font-size: 1.65em;">${user.name || user.login}</h2>
      <p style="margin: 0 auto; max-width: 280px; text-align: center; font-size: 0.95em; padding: 0.5em 1em;">${user.bio || ''}</p>
      <p style="margin: 0 auto; max-width: 280px; text-align: center; font-size: 0.75em; padding: 1em 1em;">${user.followers} followers • ${user.following} following</p>
      <a href="${user.html_url}" target="_blank" style="color: #58a6ff;">View on GitHub</a>
    </div>`;
})
.catch(err => {
  document.getElementById('github-profile').innerHTML = 'Failed to load profile.';
  console.error(err);
});
