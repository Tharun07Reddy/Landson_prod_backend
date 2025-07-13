import { PrismaClient, PlatformType, OTPType, AttributeType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import slugify from 'slugify';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');
  
  // Create default roles
  const adminRole = await createRoleIfNotExists('admin', 'Administrator with full access', true);
  const userRole = await createRoleIfNotExists('user', 'Regular user with limited access', true);
  
  // Create permissions
  await createPermissions();
  
  // Assign permissions to roles
  await assignPermissionsToRole(adminRole.id, 'admin');
  await assignPermissionsToRole(userRole.id, 'user');
  
  // Create admin user
  const adminUser = await createUserIfNotExists({
    email: 'admin@example.com',
    phone: '+1234567890',
    username: 'admin',
    password: 'Admin@123',
    firstName: 'Admin',
    lastName: 'User',
    isActive: true,
    isEmailVerified: true,
    isPhoneVerified: true,
    roles: ['admin']
  });
  
  // Create regular user
  const regularUser = await createUserIfNotExists({
    email: 'user@example.com',
    phone: '+1987654321',
    username: 'user',
    password: 'User@123',
    firstName: 'Regular',
    lastName: 'User',
    isActive: true,
    isEmailVerified: false,
    isPhoneVerified: false,
    roles: ['user']
  });
  
  // Create categories
  await seedCategories();
  
  console.log('Seeding completed successfully!');
}

// Helper function to create a role if it doesn't exist
async function createRoleIfNotExists(name: string, description: string, isSystem: boolean) {
  const existingRole = await prisma.role.findUnique({
    where: { name }
  });
  
  if (existingRole) {
    console.log(`Role '${name}' already exists.`);
    return existingRole;
  }
  
  const role = await prisma.role.create({
    data: {
      name,
      description,
      isSystem
    }
  });
  
  console.log(`Created role: ${role.name}`);
  return role;
}

// Helper function to create a user if they don't exist
async function createUserIfNotExists({
  email,
  phone,
  username,
  password,
  firstName,
  lastName,
  isActive,
  isEmailVerified,
  isPhoneVerified,
  roles
}: {
  email: string;
  phone: string;
  username: string;
  password: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  roles: string[];
}) {
  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [
        { email },
        { phone },
        { username }
      ]
    }
  });
  
  if (existingUser) {
    console.log(`User with email '${email}' or phone '${phone}' or username '${username}' already exists.`);
    return existingUser;
  }
  
  // Hash the password
  const hashedPassword = await bcrypt.hash(password, 10);
  
  // Create the user
  const user = await prisma.user.create({
    data: {
      email,
      phone,
      username,
      password: hashedPassword,
      firstName,
      lastName,
      isActive,
      isEmailVerified,
      isPhoneVerified,
      platform: PlatformType.WEB,
      deviceInfo: { lastDevice: 'Seed script' }
    }
  });
  
  // Assign roles to the user
  for (const roleName of roles) {
    const role = await prisma.role.findUnique({
      where: { name: roleName }
    });
    
    if (role) {
      await prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: role.id
        }
      });
    }
  }
  
  // Create a verification OTP for non-verified users
  if (!isEmailVerified) {
    await prisma.oTP.create({
      data: {
        userId: user.id,
        code: '123456', // Simple code for testing
        type: OTPType.EMAIL_VERIFICATION,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      }
    });
  }
  
  if (!isPhoneVerified) {
    await prisma.oTP.create({
      data: {
        userId: user.id,
        code: '123456', // Simple code for testing
        type: OTPType.PHONE_VERIFICATION,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      }
    });
  }
  
  console.log(`Created user: ${user.email}`);
  return user;
}

// Create all permissions
async function createPermissions() {
  // Define resources and their actions
  const resources = [
    {
      name: 'users',
      actions: ['create', 'read', 'update', 'delete', 'list', 'manage']
    },
    {
      name: 'roles',
      actions: ['create', 'read', 'update', 'delete', 'list', 'assign', 'manage']
    },
    {
      name: 'permissions',
      actions: ['create', 'read', 'update', 'delete', 'list', 'assign', 'manage']
    },
    {
      name: 'products',
      actions: ['create', 'read', 'update', 'delete', 'list', 'manage']
    },
    {
      name: 'categories',
      actions: ['create', 'read', 'update', 'delete', 'list', 'manage']
    },
    {
      name: 'orders',
      actions: ['create', 'read', 'update', 'delete', 'list', 'process', 'cancel', 'manage']
    },
    {
      name: 'payments',
      actions: ['create', 'read', 'refund', 'list', 'manage']
    },
    {
      name: 'config',
      actions: ['read', 'update', 'manage']
    },
    {
      name: 'analytics',
      actions: ['read', 'export', 'manage']
    }
  ];
  
  // Create permissions for each resource and action
  for (const resource of resources) {
    for (const action of resource.actions) {
      const permissionName = `${resource.name}:${action}`;
      let description = `Permission to ${action} ${resource.name}`;
      
      // Special description for manage permission
      if (action === 'manage') {
        description = `Full access to all operations on ${resource.name}`;
      }
      
      const existingPermission = await prisma.permission.findUnique({
        where: { name: permissionName }
      });
      
      if (!existingPermission) {
        await prisma.permission.create({
          data: {
            name: permissionName,
            description,
            resource: resource.name,
            action
          }
        });
        console.log(`Created permission: ${permissionName}`);
      }
    }
  }
}

// Assign permissions to a role
async function assignPermissionsToRole(roleId: string, roleName: string) {
  // Get all permissions
  const permissions = await prisma.permission.findMany();
  
  // Define permission assignments based on role
  let permissionNames: string[] = [];
  
  if (roleName === 'admin') {
    // Admin gets all permissions
    permissionNames = permissions.map(p => p.name);
  } else if (roleName === 'user') {
    // Regular users get limited permissions
    permissionNames = [
      // Product permissions
      'products:read',
      'products:list',
      
      // Category permissions
      'categories:read',
      'categories:list',
      
      // Order permissions
      'orders:create',
      'orders:read',
      'orders:list',
      'orders:cancel',
      
      // Payment permissions
      'payments:create',
      'payments:read',
      
      // User permissions (only read their own data)
      'users:read'
    ];
  }
  
  // Assign permissions to the role
  for (const permissionName of permissionNames) {
    const permission = permissions.find(p => p.name === permissionName);
    
    if (permission) {
      const existingRolePermission = await prisma.rolePermission.findFirst({
        where: {
          roleId,
          permissionId: permission.id
        }
      });
      
      if (!existingRolePermission) {
        await prisma.rolePermission.create({
          data: {
            roleId,
            permissionId: permission.id
          }
        });
        console.log(`Assigned permission ${permissionName} to role ${roleName}`);
      }
    }
  }
}

// Seed categories with hierarchical structure and attributes
async function seedCategories() {
  console.log('Seeding categories...');
  
  // Create main categories
  const electronics = await createCategory({
    name: 'Electronics',
    description: 'Electronic devices and gadgets',
    image: 'https://example.com/images/electronics.jpg',
    metaTitle: 'Electronics - Latest Gadgets and Devices',
    metaDescription: 'Shop the latest electronic devices, gadgets, and accessories.'
  });
  
  const clothing = await createCategory({
    name: 'Clothing',
    description: 'Apparel and fashion items',
    image: 'https://example.com/images/clothing.jpg',
    metaTitle: 'Clothing - Fashion & Apparel',
    metaDescription: 'Discover the latest fashion trends and clothing collections.'
  });
  
  const home = await createCategory({
    name: 'Home & Garden',
    description: 'Products for home and garden',
    image: 'https://example.com/images/home.jpg',
    metaTitle: 'Home & Garden - Furniture and Decor',
    metaDescription: 'Find everything you need for your home and garden.'
  });
  
  // Create subcategories for Electronics
  const smartphones = await createCategory({
    name: 'Smartphones',
    description: 'Mobile phones and accessories',
    parentId: electronics.id,
    image: 'https://example.com/images/smartphones.jpg',
    sortOrder: 1,
    metaTitle: 'Smartphones - Latest Models and Accessories',
    metaDescription: 'Shop the latest smartphones, cases, and accessories.'
  });
  
  const laptops = await createCategory({
    name: 'Laptops',
    description: 'Notebook computers and accessories',
    parentId: electronics.id,
    image: 'https://example.com/images/laptops.jpg',
    sortOrder: 2,
    metaTitle: 'Laptops - Notebooks and Accessories',
    metaDescription: 'Find the perfect laptop for work, gaming, or everyday use.'
  });
  
  // Create subcategories for Clothing
  const mensClothing = await createCategory({
    name: "Men's Clothing",
    description: "Clothing items for men",
    parentId: clothing.id,
    image: 'https://example.com/images/mens-clothing.jpg',
    sortOrder: 1,
    metaTitle: "Men's Clothing - Fashion & Apparel",
    metaDescription: "Shop the latest men's fashion and clothing collections."
  });
  
  const womensClothing = await createCategory({
    name: "Women's Clothing",
    description: "Clothing items for women",
    parentId: clothing.id,
    image: 'https://example.com/images/womens-clothing.jpg',
    sortOrder: 2,
    metaTitle: "Women's Clothing - Fashion & Apparel",
    metaDescription: "Discover the latest women's fashion and clothing collections."
  });
  
  // Create subcategories for Home & Garden
  const furniture = await createCategory({
    name: 'Furniture',
    description: 'Home furniture and decor',
    parentId: home.id,
    image: 'https://example.com/images/furniture.jpg',
    sortOrder: 1,
    metaTitle: 'Furniture - Home Decor and Furnishings',
    metaDescription: 'Find the perfect furniture for your home.'
  });
  
  const kitchenware = await createCategory({
    name: 'Kitchenware',
    description: 'Kitchen appliances and utensils',
    parentId: home.id,
    image: 'https://example.com/images/kitchenware.jpg',
    sortOrder: 2,
    metaTitle: 'Kitchenware - Appliances and Utensils',
    metaDescription: 'Discover kitchen appliances, utensils, and accessories.'
  });
  
  const gardening = await createCategory({
    name: 'Gardening',
    description: 'Gardening tools and supplies',
    parentId: home.id,
    image: 'https://example.com/images/gardening.jpg',
    sortOrder: 3,
    metaTitle: 'Gardening - Tools and Supplies',
    metaDescription: 'Find everything you need for your garden and outdoor spaces.'
  });
  
  // Add attributes to categories
  
  // Smartphone attributes
  await createCategoryAttribute({
    categoryId: smartphones.id,
    name: 'Brand',
    type: AttributeType.DROPDOWN,
    isRequired: true,
    options: ['Apple', 'Samsung', 'Google', 'Xiaomi', 'OnePlus', 'Huawei', 'Other'],
    sortOrder: 1
  });
  
  await createCategoryAttribute({
    categoryId: smartphones.id,
    name: 'Storage Capacity',
    type: AttributeType.DROPDOWN,
    isRequired: true,
    options: ['64GB', '128GB', '256GB', '512GB', '1TB'],
    sortOrder: 2
  });
  
  await createCategoryAttribute({
    categoryId: smartphones.id,
    name: 'Color',
    type: AttributeType.COLOR,
    isRequired: true,
    options: ['Black', 'White', 'Blue', 'Red', 'Green', 'Gold', 'Silver'],
    sortOrder: 3
  });
  
  await createCategoryAttribute({
    categoryId: smartphones.id,
    name: 'Features',
    type: AttributeType.MULTISELECT,
    options: ['5G', 'Wireless Charging', 'Water Resistant', 'Dual SIM', 'Face Recognition', 'Fingerprint Scanner'],
    sortOrder: 4
  });
  
  // Laptop attributes
  await createCategoryAttribute({
    categoryId: laptops.id,
    name: 'Brand',
    type: AttributeType.DROPDOWN,
    isRequired: true,
    options: ['Apple', 'Dell', 'HP', 'Lenovo', 'Asus', 'Acer', 'Microsoft', 'Other'],
    sortOrder: 1
  });
  
  await createCategoryAttribute({
    categoryId: laptops.id,
    name: 'Processor',
    type: AttributeType.DROPDOWN,
    isRequired: true,
    options: ['Intel Core i3', 'Intel Core i5', 'Intel Core i7', 'Intel Core i9', 'AMD Ryzen 3', 'AMD Ryzen 5', 'AMD Ryzen 7', 'AMD Ryzen 9', 'Apple M1', 'Apple M2', 'Apple M3'],
    sortOrder: 2
  });
  
  await createCategoryAttribute({
    categoryId: laptops.id,
    name: 'RAM',
    type: AttributeType.DROPDOWN,
    isRequired: true,
    options: ['4GB', '8GB', '16GB', '32GB', '64GB'],
    sortOrder: 3
  });
  
  await createCategoryAttribute({
    categoryId: laptops.id,
    name: 'Storage Type',
    type: AttributeType.DROPDOWN,
    options: ['SSD', 'HDD', 'Hybrid'],
    sortOrder: 4
  });
  
  // Clothing attributes
  const sizeAttribute = {
    name: 'Size',
    type: AttributeType.DROPDOWN,
    isRequired: true,
    sortOrder: 1
  };
  
  await createCategoryAttribute({
    categoryId: mensClothing.id,
    ...sizeAttribute,
    options: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL']
  });
  
  await createCategoryAttribute({
    categoryId: womensClothing.id,
    ...sizeAttribute,
    options: ['XS', 'S', 'M', 'L', 'XL', 'XXL']
  });
  
  const colorAttribute = {
    name: 'Color',
    type: AttributeType.COLOR,
    isRequired: true,
    options: ['Black', 'White', 'Blue', 'Red', 'Green', 'Yellow', 'Purple', 'Pink', 'Grey', 'Brown'],
    sortOrder: 2
  };
  
  await createCategoryAttribute({
    categoryId: mensClothing.id,
    ...colorAttribute
  });
  
  await createCategoryAttribute({
    categoryId: womensClothing.id,
    ...colorAttribute
  });
  
  // Furniture attributes
  await createCategoryAttribute({
    categoryId: furniture.id,
    name: 'Material',
    type: AttributeType.DROPDOWN,
    options: ['Wood', 'Metal', 'Glass', 'Plastic', 'Fabric', 'Leather', 'Composite'],
    sortOrder: 1
  });
  
  await createCategoryAttribute({
    categoryId: furniture.id,
    name: 'Color',
    type: AttributeType.COLOR,
    options: ['Black', 'White', 'Brown', 'Grey', 'Beige', 'Blue', 'Green', 'Red'],
    sortOrder: 2
  });
  
  await createCategoryAttribute({
    categoryId: furniture.id,
    name: 'Room',
    type: AttributeType.DROPDOWN,
    options: ['Living Room', 'Bedroom', 'Dining Room', 'Office', 'Kitchen', 'Bathroom', 'Outdoor'],
    sortOrder: 3
  });
  
  // Kitchenware attributes
  await createCategoryAttribute({
    categoryId: kitchenware.id,
    name: 'Material',
    type: AttributeType.DROPDOWN,
    options: ['Stainless Steel', 'Glass', 'Plastic', 'Ceramic', 'Wood', 'Silicone', 'Cast Iron'],
    sortOrder: 1
  });
  
  await createCategoryAttribute({
    categoryId: kitchenware.id,
    name: 'Dishwasher Safe',
    type: AttributeType.BOOLEAN,
    sortOrder: 2
  });
  
  // Gardening attributes
  await createCategoryAttribute({
    categoryId: gardening.id,
    name: 'Tool Type',
    type: AttributeType.DROPDOWN,
    options: ['Hand Tools', 'Power Tools', 'Watering Equipment', 'Planters', 'Fertilizers', 'Seeds', 'Plants'],
    sortOrder: 1
  });
  
  await createCategoryAttribute({
    categoryId: gardening.id,
    name: 'Material',
    type: AttributeType.DROPDOWN,
    options: ['Steel', 'Aluminum', 'Wood', 'Plastic', 'Fiberglass', 'Ceramic'],
    sortOrder: 2
  });
  
  console.log('Categories seeded successfully!');
}

// Helper function to create a category
async function createCategory({
  name,
  description,
  parentId = null,
  image = null,
  isActive = true,
  sortOrder = 0,
  metaTitle = null,
  metaDescription = null
}: {
  name: string;
  description?: string;
  parentId?: string | null;
  image?: string | null;
  isActive?: boolean;
  sortOrder?: number;
  metaTitle?: string | null;
  metaDescription?: string | null;
}) {
  // Generate slug from name
  const baseSlug = slugify(name, { lower: true });
  let slug = baseSlug;
  let counter = 1;
  
  // Check if slug already exists and generate a unique one
  while (await prisma.category.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
  
  const category = await prisma.category.create({
    data: {
      name,
      slug,
      description,
      parentId,
      image,
      isActive,
      sortOrder,
      metaTitle,
      metaDescription
    }
  });
  
  console.log(`Created category: ${category.name}`);
  return category;
}

// Helper function to create a category attribute
async function createCategoryAttribute({
  categoryId,
  name,
  type,
  isRequired = false,
  options = [],
  defaultValue = null,
  sortOrder = 0
}: {
  categoryId: string;
  name: string;
  type: AttributeType;
  isRequired?: boolean;
  options?: string[];
  defaultValue?: string | null;
  sortOrder?: number;
}) {
  const attribute = await prisma.categoryAttribute.create({
    data: {
      categoryId,
      name,
      type,
      isRequired,
      options,
      defaultValue,
      sortOrder
    }
  });
  
  console.log(`Created attribute: ${attribute.name} for category ID ${categoryId}`);
  return attribute;
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 