import openai

# Call the OpenAI API with a basic prompt
response = openai.ChatCompletion.create(
    model="gpt-4",  # Or use another model like "gpt-3.5-turbo"
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Hello, how can I use the OpenAI API?"}
    ]
)

# Print the response
print(response['choices'][0]['message']['content'])

