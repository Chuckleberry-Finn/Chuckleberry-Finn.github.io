const FormHandler = {
  getFormData(form) {
    const formData = {};
    const inputs = form.querySelectorAll('input, textarea, select');
    
    inputs.forEach(input => {
      if (input.name) {
        formData[input.name] = input.value.trim();
      }
    });
    
    return formData;
  }
};
